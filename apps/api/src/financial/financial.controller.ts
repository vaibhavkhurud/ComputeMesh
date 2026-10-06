import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FinancialService } from './financial.service';
import { ReserveFundsDto, GetWalletDto } from './dto/financial.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('balance')
  async getBalance(@Request() req: any, @Query() query: GetWalletDto) {
    if (!req.user || !req.user.id) throw new UnauthorizedException();
    // Default type to user's role if they are CUSTOMER or PROVIDER
    let type: 'CUSTOMER' | 'PROVIDER' = query.type as any;
    if (!type) {
      if (req.user.role === 'CUSTOMER') type = 'CUSTOMER';
      else if (req.user.role === 'PROVIDER') type = 'PROVIDER';
      else throw new BadRequestException('Wallet type must be explicitly provided for this role');
    }

    if (type !== 'CUSTOMER' && type !== 'PROVIDER') {
      throw new BadRequestException('Invalid wallet type');
    }

    return await this.financialService.getWalletBalance(req.user.id, type);
  }

  @Get('transactions')
  async getTransactions(@Request() req: any, @Query() query: GetWalletDto) {
    if (!req.user || !req.user.id) throw new UnauthorizedException();
    let type: 'CUSTOMER' | 'PROVIDER' = query.type as any;
    if (!type) {
      if (req.user.role === 'CUSTOMER') type = 'CUSTOMER';
      else if (req.user.role === 'PROVIDER') type = 'PROVIDER';
      else throw new BadRequestException('Wallet type must be explicitly provided for this role');
    }

    if (type !== 'CUSTOMER' && type !== 'PROVIDER') {
      throw new BadRequestException('Invalid wallet type');
    }

    return await this.financialService.getTransactions(req.user.id, type);
  }

  @Post('reservations')
  @Roles('CUSTOMER')
  async reserveFunds(@Request() req: any, @Body() dto: ReserveFundsDto) {
    if (!req.user || !req.user.id) throw new UnauthorizedException();
    
    if (!dto.jobId || typeof dto.jobId !== 'string') throw new BadRequestException('jobId required');
    if (!dto.maxCostCents || !/^[1-9][0-9]*$/.test(dto.maxCostCents)) throw new BadRequestException('maxCostCents must be positive integer string');

    const maxCost = BigInt(dto.maxCostCents);
    
    return await this.financialService.reserveFunds(dto.jobId, req.user.id, maxCost);
  }
}

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobFinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Post(':jobId/settle')
  @Roles('ADMIN') // Depending on who settles; M10 scheduler or admin. Assuming ADMIN for manual, or SYSTEM for automated.
  async settleJob(@Param('jobId') jobId: string, ) {
    // We need the customer ID to settle. The service looks it up from the job.
    // Wait, the FinancialService.settleJob takes customerId as a parameter.
    // Let's modify service to look up customerId if we don't have it, or we look it up here.
    return await this.financialService.settleJob(jobId); 
  }

  @Post(':jobId/refund')
  @Roles('ADMIN')
  async refundJob(@Param('jobId') jobId: string, ) {
    return await this.financialService.refundJob(jobId);
  }
}
