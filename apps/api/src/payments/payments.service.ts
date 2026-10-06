import { Injectable, BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { FinancialService } from '../financial/financial.service';
import { getDatabaseClient } from '@computemesh/database';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly financialService: FinancialService,
  ) {}

  async createDeposit(userId: string, amountCents: bigint, idempotencyKey: string) {
    if (amountCents <= 0n) {
      throw new BadRequestException('Amount must be strictly positive');
    }

    const db = getDatabaseClient();

    // Get the user's CUSTOMER wallet using the authoritative FinancialService
    const wallet = await this.financialService.getWallet(userId, 'CUSTOMER', true, userId);

    // Check idempotency in our DB
    const existingPayment = await db.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      throw new ConflictException('Payment with this idempotency key already exists');
    }

    // 1. Create Payment record (CREATED)
    const payment = await db.payment.create({
      data: {
        userId,
        walletId: wallet.id,
        amount: amountCents,
        currency: 'usd',
        status: 'CREATED',
        idempotencyKey,
      },
    });

    // 2. Create Stripe PaymentIntent
    const stripe = this.stripeService.getClient();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: Number(amountCents),
          currency: 'usd',
          metadata: {
            computeMeshPaymentId: payment.id,
          },
        },
        {
          idempotencyKey: `stripe-pi-${payment.id}`,
        }
      );
    } catch (error: any) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException(`Stripe error: ${error.message}`);
    }

    // 3. Update Payment with Intent ID
    await db.payment.update({
      where: { id: payment.id },
      data: { 
        stripePaymentIntentId: paymentIntent.id,
        status: 'REQUIRES_ACTION',
      },
    });

    return {
      paymentId: payment.id,
      clientSecret: paymentIntent.client_secret,
    };
  }

  async getPayments(userId: string) {
    const db = getDatabaseClient();
    const payments = await db.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(p => ({
      ...p,
      amount: p.amount.toString(),
    }));
  }

  async getPayment(userId: string, paymentId: string) {
    const db = getDatabaseClient();
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.userId !== userId) {
      throw new ForbiddenException('Cannot access this payment');
    }
    return {
      ...payment,
      amount: payment.amount.toString(),
    };
  }

  async handleStripeWebhook(signature: string, payload: Buffer) {
    const stripe = this.stripeService.getClient();
    const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_TEST_WEBHOOK_SECRET is missing from environment configuration');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    const db = getDatabaseClient();

    let claimed = false;
    let providerEvent;
    
    // CRITICAL 1: Atomic claiming
    try {
      providerEvent = await db.paymentProviderEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          status: 'PENDING',
        },
      });
      claimed = true;
    } catch (e: any) {
      if (e.code === 'P2002') {
        providerEvent = await db.paymentProviderEvent.findUnique({ where: { stripeEventId: event.id } });
      } else {
        throw e;
      }
    }

    if (!claimed && providerEvent) {
      if (providerEvent.status === 'PROCESSED') {
        return { received: true, status: 'already_processed' };
      }
      if (providerEvent.status === 'PENDING') {
        // Another thread is processing this right now.
        // Return 409 to safely back off and let Stripe retry if the other thread fails.
        throw new ConflictException('Concurrent webhook processing');
      }
      if (providerEvent.status === 'FAILED') {
        // Retry atomic claim
        const updated = await db.paymentProviderEvent.updateMany({
          where: { stripeEventId: event.id, status: 'FAILED' },
          data: { status: 'PENDING' }
        });
        if (updated.count === 1) {
          claimed = true;
        } else {
          throw new ConflictException('Concurrent webhook processing');
        }
      }
    }

    if (!claimed) {
      throw new ConflictException('Could not claim event for processing');
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as any;
        const computeMeshPaymentId = paymentIntent.metadata?.computeMeshPaymentId;

        let payment;
        if (computeMeshPaymentId) {
          payment = await db.payment.findUnique({ where: { id: computeMeshPaymentId } });
        } else {
          payment = await db.payment.findUnique({ where: { stripePaymentIntentId: paymentIntent.id } });
        }
        
        if (!payment) throw new NotFoundException('Payment not found');

        // CRITICAL 3: Validation against authoritative payment!
        if (payment.stripePaymentIntentId !== paymentIntent.id) {
          throw new BadRequestException('Intent mismatch');
        }
        if (paymentIntent.amount !== Number(payment.amount)) {
          throw new BadRequestException('Amount mismatch');
        }
        if (paymentIntent.currency !== payment.currency) {
          throw new BadRequestException('Currency mismatch');
        }

        if (payment.status !== 'SUCCEEDED') {
          await this.financialService.processDeposit(payment.id, `pi_dep_${payment.id}`);
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as any;
        const computeMeshPaymentId = paymentIntent.metadata?.computeMeshPaymentId;
        
        let payment;
        if (computeMeshPaymentId) {
          payment = await db.payment.findUnique({ where: { id: computeMeshPaymentId } });
        } else {
          payment = await db.payment.findUnique({ where: { stripePaymentIntentId: paymentIntent.id } });
        }

        if (payment && payment.status !== 'FAILED') {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED' },
          });
        }
      }

      await db.paymentProviderEvent.update({
        where: { stripeEventId: event.id },
        data: { 
          status: 'PROCESSED',
          processedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });

      return { received: true };
    } catch (error: any) {
      await db.paymentProviderEvent.update({
        where: { stripeEventId: event.id },
        data: { 
          status: 'FAILED',
          failureReason: error.message,
          attemptCount: { increment: 1 },
        },
      });
      throw error; // Re-throw to return 500 to Stripe
    }
  }
}
