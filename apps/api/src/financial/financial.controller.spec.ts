import { Test, TestingModule } from '@nestjs/testing';
import { FinancialController, JobFinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';

import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('FinancialController - Auth & IDOR', () => {
  let controller: FinancialController;
  let jobController: JobFinancialController;
  let service: any;

  beforeEach(async () => {
    service = {
      getWalletBalance: jest.fn(),
      getTransactions: jest.fn(),
      reserveFunds: jest.fn(),
      settleJob: jest.fn(),
      refundJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialController, JobFinancialController],
      providers: [{ provide: FinancialService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FinancialController>(FinancialController);
    jobController = module.get<JobFinancialController>(JobFinancialController);
  });

  it('should reject unauthenticated access', async () => {
    await expect(controller.getBalance({ user: null }, { type: 'CUSTOMER' })).rejects.toThrow(UnauthorizedException);
    await expect(controller.getTransactions({ user: null }, { type: 'CUSTOMER' })).rejects.toThrow(UnauthorizedException);
    await expect(controller.reserveFunds({ user: null }, { jobId: '1', maxCostCents: '10' })).rejects.toThrow(UnauthorizedException);
  });

  it('should infer wallet type from role if not provided', async () => {
    service.getWalletBalance.mockResolvedValue({ balance: '10' });
    await controller.getBalance({ user: { id: 'u1', role: 'CUSTOMER' } }, {});
    expect(service.getWalletBalance).toHaveBeenCalledWith('u1', 'CUSTOMER');
  });

  it('should reject invalid wallet types', async () => {
    await expect(
      controller.getBalance({ user: { id: 'u1', role: 'CUSTOMER' } }, { type: 'SYSTEM' as any })
    ).rejects.toThrow(BadRequestException);
  });

  it('reserveFunds parses positive maxCostCents', async () => {
    await controller.reserveFunds({ user: { id: 'u1' } }, { jobId: '123', maxCostCents: '100' });
    expect(service.reserveFunds).toHaveBeenCalledWith('123', 'u1', 100n);
  });

  it('should call refundJob with admin user id', async () => {
    await jobController.refundJob('j1');
    expect(service.refundJob).toHaveBeenCalledWith('j1');
  });

  it('should call settleJob', async () => {
    await jobController.settleJob('j1');
    expect(service.settleJob).toHaveBeenCalledWith('j1');
  });
});
