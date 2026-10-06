import { FinancialService } from './financial.service';
import { BillingCalculator } from './billing.calculator';
import { getDatabaseClient } from '@computemesh/database';
import { v4 as uuidv4 } from 'uuid';

describe('BillingCalculator', () => {
  it('should calculate 1ms billing correctly', () => {
    // 1ms at 50 cents/hr (which is ~0.0000138 cents/ms) -> ceil to 1 cent
    const billableCents = BillingCalculator.calculateBillableCents(1n, 50n);
    expect(billableCents).toBe(1n);
  });

  it('should calculate 1 hour exactly', () => {
    // 3600000ms at 50 cents/hr
    const billableCents = BillingCalculator.calculateBillableCents(3600000n, 50n);
    expect(billableCents).toBe(50n);
  });

  it('should calculate commission accurately (10%)', () => {
    // 11 cents, 10% commission = 2 cents (ceil), provider gets 9
    const res = BillingCalculator.calculateCommissionAndEarnings(11n, 1000);
    expect(res.platformCommission).toBe(2n);
    expect(res.providerEarning).toBe(9n);
    expect(res.platformCommission + res.providerEarning).toBe(11n);
  });
});

describe('FinancialService - E2E against local PG', () => {
  let service: FinancialService;
  let db: any;
  let userA: string;
  let providerA: string;

  beforeAll(async () => {
    service = new FinancialService();
    db = getDatabaseClient();
    
    // Create test users
    userA = uuidv4();
    providerA = uuidv4();
    await db.user.createMany({
      data: [
        { id: userA, email: `cust-${userA}@test.com`, role: 'CUSTOMER', passwordHash: 'hash' },
        { id: providerA, email: `prov-${providerA}@test.com`, role: 'PROVIDER', passwordHash: 'hash' }
      ]
    });
  });

  it('should get or create wallets', async () => {
    const sysW = await service.getSystemWallet();
    expect(sysW.type).toBe('SYSTEM');

    const cW = await service.getWallet(userA, 'CUSTOMER', false);
    expect(cW.balance).toBe(0n);
  });

  it('reservation should fail on insufficient funds', async () => {
    await expect(service.reserveFunds('fake-job-id', userA, 100n)).rejects.toThrow('Insufficient funds');
  });

  it('reservation should succeed if funds exist, and lock concurrently', async () => {
    await db.wallet.update({
      where: { userId: userA },
      data: { balance: 100n }
    });

    const jobId = uuidv4();
    const res = await service.reserveFunds(jobId, userA, 40n);
    expect(res.status).toBe('PENDING');

    const bal = await service.getWalletBalance(userA, 'CUSTOMER');
    expect(bal.balance).toBe('100');
    expect(bal.reservedBalance).toBe('40');
    expect(bal.availableBalance).toBe('60');
    
    // Concurrent test
    const jobId2 = uuidv4();
    const jobId3 = uuidv4();
    
    await Promise.allSettled([
      service.reserveFunds(jobId2, userA, 60n),
      service.reserveFunds(jobId3, userA, 60n).catch(e => e)
    ]);
    
    const balAfter = await service.getWalletBalance(userA, 'CUSTOMER');
    // One 60n should succeed, one should fail (insufficient).
    // Total reserved = 40 + 60 = 100.
    expect(balAfter.reservedBalance).toBe('100');
    expect(balAfter.availableBalance).toBe('0');
  });

  it('settlement should process successfully and release reservation', async () => {
    const jobId = uuidv4();
    await db.wallet.update({
      where: { userId: userA },
      data: { balance: 100n, reservedBalance: 0n }
    });
    
    await service.reserveFunds(jobId, userA, 40n);
    
    const provWallet = await service.getWallet(providerA, 'PROVIDER', false);

    // Create job and segments
    await db.job.create({ data: { id: jobId, userId: userA, name: 'test-job', quotedPriceCentsPerHour: 40 } });
    
    const assignId = uuidv4();
    await db.jobAssignment.create({
      data: {
        id: assignId,
        jobId,
        machineId: (await db.machine.create({ data: { name: 'test-m', hostname: 'host', operatingSystem: 'linux', architecture: 'amd64', region: 'us-east-1', providerId: (await db.provider.create({ data: { userId: providerA, displayName: 'Provider A' } })).id } })).id,
        providerId: (await db.provider.findFirst({ where: { userId: providerA } })).id
      }
    });

    await db.billingSegment.create({
      data: {
        jobId,
        assignmentId: assignId,
        providerWalletId: provWallet.id,
        status: 'COMPLETED',
        actualDurationMs: 3600000n, // 1 hour
        flatCentsPerHour: 50,
        cpuCentsPerHour: 0,
        memoryGbCentsPerHour: 0,
        gpuCentsPerHour: 0,
        requestedCpuCores: 0,
        requestedMemoryGb: 0,
        requestedGpuCount: 0,
        minBillingMinutes: 15
      }
    });

    const res = await service.settleJob(jobId, userA);
    expect(res.amount).toBe(50n); // 50 cents total

    // Check balances
    const cW = await service.getWalletBalance(userA, 'CUSTOMER');
    expect(cW.balance).toBe('50'); // 100 - 50
    expect(cW.reservedBalance).toBe('0');

    const pW = await service.getWalletBalance(providerA, 'PROVIDER');
    expect(pW.balance).toBe('45'); // 50 - 5 (10% commission)

    const sysW = await service.getSystemWallet();
    expect(sysW.balance > 0n).toBeTruthy(); 
  });
});
