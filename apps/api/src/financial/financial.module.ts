import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController, JobFinancialController } from './financial.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FinancialController, JobFinancialController],
  providers: [FinancialService],
  exports: [FinancialService],
})
export class FinancialModule {}
