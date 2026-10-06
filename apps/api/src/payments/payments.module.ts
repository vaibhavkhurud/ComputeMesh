import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';
import { FinancialModule } from '../financial/financial.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [FinancialModule, AuthModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [StripeService, PaymentsService],
  exports: [StripeService, PaymentsService],
})
export class PaymentsModule {}
