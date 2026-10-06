import { Test, TestingModule } from '@nestjs/testing';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';
import { FinancialService } from '../financial/financial.service';
import { ConfigModule } from '@nestjs/config';

// Mock getDatabaseClient
jest.mock('@computemesh/database', () => {
  const mDb = {
    paymentProviderEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => {
      return cb(mDb); // Execute the transaction callback passing the mock DB
    }),
    payment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return { getDatabaseClient: jest.fn(() => mDb) };
});

import { getDatabaseClient } from '@computemesh/database';

describe('M13-B2 Customer Payment Flow', () => {
  let paymentsService: PaymentsService;
  let stripeService: StripeService;
  let financialService: FinancialService;
  let db: any;

  beforeEach(async () => {
    process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_fake_key';

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        StripeService,
        PaymentsService,
        {
          provide: FinancialService,
          useValue: {
            getWallet: jest.fn(),
          },
        },
      ],
    }).compile();

    stripeService = module.get<StripeService>(StripeService);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    financialService = module.get<FinancialService>(FinancialService);
    
    stripeService.onModuleInit();
    db = getDatabaseClient();
    jest.clearAllMocks();
  });

  it('B2: createDeposit should create Payment, PaymentIntent, return clientSecret, and NOT credit wallet', async () => {
    const mockWallet = { id: 'w1', userId: 'u1', type: 'CUSTOMER', balance: 0n };
    (financialService.getWallet as jest.Mock).mockResolvedValue(mockWallet);
    
    db.payment.findUnique.mockResolvedValue(null);
    db.payment.create.mockResolvedValue({ id: 'p1', amount: 1000n, status: 'CREATED' });
    db.payment.update.mockResolvedValue({ id: 'p1', status: 'REQUIRES_ACTION' });

    const mPaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_123',
      client_secret: 'secret_123'
    });
    
    jest.spyOn(stripeService, 'getClient').mockReturnValue({
      paymentIntents: {
        create: mPaymentIntentsCreate
      }
    } as any);

    const result = await paymentsService.createDeposit('u1', 1000n, 'idem-1');

    expect(financialService.getWallet).toHaveBeenCalledWith('u1', 'CUSTOMER', true, 'u1');
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        walletId: 'w1',
        amount: 1000n,
        status: 'CREATED',
        idempotencyKey: 'idem-1',
      })
    });
    
    expect(mPaymentIntentsCreate).toHaveBeenCalledWith(
      { amount: 1000, currency: 'usd', metadata: { computeMeshPaymentId: 'p1' } },
      { idempotencyKey: 'stripe-pi-p1' }
    );
    
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        stripePaymentIntentId: 'pi_123',
        status: 'REQUIRES_ACTION'
      }
    });

    expect(result).toEqual({
      paymentId: 'p1',
      clientSecret: 'secret_123'
    });
  });

  it('B3: Webhook must cryptographically verify signature, process idempotently, and ONLY then credit wallet via processDeposit', async () => {
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';
    const mockPayload = Buffer.from('test-payload');
    const mockSignature = 'test-signature';
    
    // Mock stripe.webhooks.constructEvent
    const mConstructEvent = jest.fn().mockReturnValue({
      id: 'evt_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount: 1000,
          currency: 'usd',
          metadata: { computeMeshPaymentId: 'p1' }
        }
      }
    });

    jest.spyOn(stripeService, 'getClient').mockReturnValue({
      webhooks: {
        constructEvent: mConstructEvent
      }
    } as any);

    // Mock existing event (idempotency) - first call it returns null, so we process it
    db.paymentProviderEvent.findUnique.mockResolvedValue(null);
    db.paymentProviderEvent.create.mockResolvedValue({});
    
    // Mock payment lookup
    db.payment.findUnique.mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      amount: 1000n,
      currency: 'usd',
      stripePaymentIntentId: 'pi_123',
      status: 'REQUIRES_ACTION'
    });

    // Mock processDeposit
    (financialService as any).processDeposit = jest.fn().mockResolvedValue(true);

    const result = await paymentsService.handleStripeWebhook(mockSignature, mockPayload);

    // Verify cryptographic signature check was called
    expect(mConstructEvent).toHaveBeenCalledWith(mockPayload, mockSignature, 'whsec_test');

    // Verify idempotency check
    // No findUnique expected for success
    
    // CRITICAL REQUIREMENT: ONLY the webhook credits the wallet
    expect((financialService as any).processDeposit).toHaveBeenCalledWith('p1', 'pi_dep_p1');

    // Verify event marked as processed
    expect(db.paymentProviderEvent.update).toHaveBeenCalledWith({
      where: { stripeEventId: 'evt_123' },
      data: expect.objectContaining({ status: 'PROCESSED' })
    });

    expect(result).toEqual({ received: true });
  });

  it('B3: Webhook idempotency - should skip processing if event is already processed', async () => {
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_test';
    
    const mConstructEvent = jest.fn().mockReturnValue({
      id: 'evt_123',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: {} } }
    });

    jest.spyOn(stripeService, 'getClient').mockReturnValue({
      webhooks: { constructEvent: mConstructEvent }
    } as any);

    // Mock idempotency - returns existing processed event
    db.paymentProviderEvent.create.mockRejectedValue({ code: 'P2002' });
    db.paymentProviderEvent.findUnique.mockResolvedValue({
      stripeEventId: 'evt_123',
      status: 'PROCESSED'
    });

    (financialService as any).processDeposit = jest.fn();

    const result = await paymentsService.handleStripeWebhook('sig', Buffer.from(''));

    // Should return early
    expect(result).toEqual({ received: true, status: 'already_processed' });
    
    // Must NOT credit wallet again
    expect((financialService as any).processDeposit).not.toHaveBeenCalled();
  });
});