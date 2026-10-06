import { Controller, Post, Headers, Request, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class WebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('stripe/webhook')
  async handleStripeWebhook(
    @Request() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // req.rawBody is not set by default express.raw unless configured carefully,
    // but in main.ts we used express.raw({ type: 'application/json' }) which sets req.body to a Buffer!
    // If it's a buffer, we pass it directly.
    
    let payload = req.body;
    
    if (!Buffer.isBuffer(payload)) {
      // If it's not a buffer, it means it got parsed by JSON parser (shouldn't happen if express.raw matched)
      // We can stringify it, but Stripe signature verification requires exact raw body.
      throw new BadRequestException('Webhook payload was not parsed as a Buffer');
    }

    return await this.paymentsService.handleStripeWebhook(signature, payload);
  }
}
