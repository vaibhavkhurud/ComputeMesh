import { Controller, Post, Get, Body, Headers, Request, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateDepositDto, createDepositSchema } from './dto/deposit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '@computemesh/validation';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('deposit')
  @Roles('CUSTOMER')
  async createDeposit(
    @Request() req: any,
    @Body(new ZodValidationPipe(createDepositSchema)) dto: CreateDepositDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key header is required');
    }
    const amountCents = BigInt(dto.amount);
    return await this.paymentsService.createDeposit(req.user.id, amountCents, idempotencyKey);
  }

  @Get()
  @Roles('CUSTOMER', 'PROVIDER') // Providers might have payments eventually, but primarily CUSTOMER
  async getPayments(@Request() req: any) {
    return await this.paymentsService.getPayments(req.user.id);
  }

  @Get(':id')
  @Roles('CUSTOMER', 'PROVIDER')
  async getPayment(@Request() req: any, @Param('id') id: string) {
    return await this.paymentsService.getPayment(req.user.id, id);
  }
}
