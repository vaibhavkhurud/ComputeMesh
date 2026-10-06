import { FinancialService } from './financial.service';
import { BillingCalculator } from './billing.calculator';
import { getDatabaseClient } from '@computemesh/database';
import { v4 as uuidv4 } from 'uuid';

describe('M13-A Phase 2 Verification - Financial Core Constraints & Features', () => {
  let service: FinancialService;
  let db: any;
  let customerId: string;
  let customerWalletId: string;
  let providerId: string;
  let providerWalletId: string;
  let systemWalletId: string;

  beforeAll(async () => {
    service = new FinancialService();
    db = getDatabaseClient();
    
    // Create base customer and provider
    customerId = uuidv4();
    providerId = uuidv4();
    await db.user.createMany({
      data: [
        { id: customerId, email: `cust-${customerId}@test.com`, role: 'CUSTOMER', passwordHash: 'hash' },
        { id: providerId, email: `prov-${providerId}@test.com`, role: 'PROVIDER', passwordHash: 'hash' }
      ]
    });
    
    await db.provider.create({ data: { userId: providerId, displayName: 'Test Provider' } });

    const cW = await service.getWallet(customerId, 'CUSTOMER', false);
    customerWalletId = cW.id;
    
    const pW = await service.getWallet(providerId, 'PROVIDER', false);
    providerWalletId = pW.id;
    
    const sW = await service.getSystemWallet();
    systemWalletId = sW.id;
  });

  describe('1. RESERVATION', () => {
    it('should reject on insufficient funds', async () => {
      const jobId = uuidv4();
      await db.wallet.update({ where: { id: customerWalletId }, data: { balance: 0n, reservedBalance: 0n } });
      await expect(service.reserveFunds(jobId, customerId, 100n)).rejects.toThrow('Insufficient funds');
    });

    it('should succeed with sufficient funds and calculate exact available balance', async () => {
      const jobId = uuidv4();
      await db.wallet.update({ where: { id: customerWalletId }, data: { balance: 100n, reservedBalance: 0n } });
      await service.reserveFunds(jobId, customerId, 40n);
      
      const bal = await service.getWalletBalance(customerId, 'CUSTOMER');
      expect(bal.balance).toBe('100');
      expect(bal.reservedBalance).toBe('40');
      expect(bal.availableBalance).toBe('60');
    });

    it('should handle duplicate reservation idempotently', async () => {
      const jobId = uuidv4();
      await db.wallet.update({ where: { id: customerWalletId }, data: { balance: 100n, reservedBalance: 0n } });
      await service.reserveFunds(jobId, customerId, 40n);
      
      // Call again with same idempotency key (jobId)
      await service.reserveFunds(jobId, customerId, 40n);
      
      const bal = await service.getWalletBalance(customerId, 'CUSTOMER');
      expect(bal.reservedBalance).toBe('40'); // Not 80
    });

    it('should handle 5 concurrent reservations safely', async () => {
      await db.wallet.update({ where: { id: customerWalletId }, data: { balance: 100n, reservedBalance: 0n } });
      
      const jobs = [uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4()];
      const results = await Promise.allSettled(
        jobs.map(id => service.reserveFunds(id, customerId, 25n))
      );
      
      // 4 should succeed (25 * 4 = 100), 1 should fail
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      expect(succeeded.length).toBe(4);
      expect(failed.length).toBe(1);
      
      const bal = await service.getWalletBalance(customerId, 'CUSTOMER');
      expect(bal.reservedBalance).toBe('100');
      expect(bal.availableBalance).toBe('0');
      
      // Verify balance never becomes negative and reserved never exceeds balance
      expect(BigInt(bal.balance) >= 0n).toBeTruthy();
      expect(BigInt(bal.reservedBalance) <= BigInt(bal.balance)).toBeTruthy();
    });
  });

  describe('2. BILLING & 3. COMMISSION', () => {
    it('should bill 1ms accurately (min boundary ceiling)', () => {
      const cents = BillingCalculator.calculateBillableCents(1n, 50n); // 50 cents/hour
      expect(cents).toBe(1n); 
    });
    
    it('should bill exactly 1 hour accurately', () => {
      const cents = BillingCalculator.calculateBillableCents(3600000n, 50n);
      expect(cents).toBe(50n); 
    });
    
    it('should calculate fractional hour with ceiling', () => {
      // 1.5 hours
      const cents = BillingCalculator.calculateBillableCents(5400000n, 50n);
      expect(cents).toBe(75n); 
    });
    
    it('should handle large duration and monetary values', () => {
      const cents = BillingCalculator.calculateBillableCents(10000000000n, 50000n);
      expect(cents > 0n).toBeTruthy(); 
    });

    it('should handle 0% commission', () => {
      const c = BillingCalculator.calculateCommissionAndEarnings(100n, 0);
      expect(c.platformCommission).toBe(0n);
      expect(c.providerEarning).toBe(100n);
    });

    it('should handle 10% commission', () => {
      const c = BillingCalculator.calculateCommissionAndEarnings(11n, 1000);
      expect(c.platformCommission).toBe(2n);
      expect(c.providerEarning).toBe(9n);
    });

    it('should handle 100% commission', () => {
      const c = BillingCalculator.calculateCommissionAndEarnings(100n, 10000);
      expect(c.platformCommission).toBe(100n);
      expect(c.providerEarning).toBe(0n);
    });
  });

  describe('4. BILLING SEGMENTS & 5. PROVIDER FAILURE', () => {
    it('should only allocate billable time to COMPLETED segment and enforce minimum billing', async () => {
      const jobId = uuidv4();
      await db.wallet.update({ where: { id: customerWalletId }, data: { balance: 100n, reservedBalance: 0n } });
      await db.job.create({ data: { id: jobId, userId: customerId, name: 'failover-test', quotedPriceCentsPerHour: 40 } });
      
      await service.reserveFunds(jobId, customerId, 40n);

      const assign1 = uuidv4();
      const assign2 = uuidv4();

const m1Id = uuidv4(); await db.machine.create({ data: { id: m1Id, name: 'm1', hostname: 'h1', operatingSystem: 'linux', architecture: 'amd64', region: 'us', providerId: (await db.provider.findFirst({where: {userId: providerId}})).id } });

      await db.jobAssignment.create({ data: { id: assign1, jobId, status: 'REJECTED', machineId: m1Id, providerId: (await db.provider.findFirst({where: {userId: providerId}})).id } });
      await db.jobAssignment.create({ data: { id: assign2, jobId, machineId: m1Id, providerId: (await db.provider.findFirst({where: {userId: providerId}})).id } });

      // Provider A fails (7 minutes)
      await db.billingSegment.create({
        data: {
          jobId, assignmentId: assign1, providerWalletId: providerWalletId,
          status: 'FAILED', actualDurationMs: 420000n,
          flatCentsPerHour: 50, cpuCentsPerHour: 0, memoryGbCentsPerHour: 0, gpuCentsPerHour: 0, requestedCpuCores: 0, requestedMemoryGb: 0, requestedGpuCount: 0,
          minBillingMinutes: 15
        }
      });

      // Provider B completes (4 minutes)
      await db.billingSegment.create({
        data: {
          jobId, assignmentId: assign2, providerWalletId: providerWalletId,
          status: 'COMPLETED', actualDurationMs: 240000n,
          flatCentsPerHour: 50, cpuCentsPerHour: 0, memoryGbCentsPerHour: 0, gpuCentsPerHour: 0, requestedCpuCores: 0, requestedMemoryGb: 0, requestedGpuCount: 0,
          minBillingMinutes: 15
        }
      });

      const res = await service.settleJob(jobId, customerId);
      
      // Expected minimum 15m = 900,000ms. 900000ms at 50 cents/hour = ceil(12.5 cents) = 13 cents
      expect(res.amount).toBe(13n);

      const a1 = await db.billingSegment.findUnique({ where: { assignmentId: assign1 } });
      const a2 = await db.billingSegment.findUnique({ where: { assignmentId: assign2 } });

      // Failed segment gets 0 allocation
      expect(a1.billableDurationMs).toBe(0n);
      expect(a1.billedAmount).toBe(0n);

      // Completed gets minimum allocation
      expect(a2.billableDurationMs).toBe(900000n);
      expect(a2.billedAmount).toBe(13n);
    });
  });

  describe('8. SETTLEMENT IDEMPOTENCY', () => {
    it('should not process the same settlement twice', async () => {
      const jobId = uuidv4();
      await db.wallet.update({ where: { id: customerWalletId }, data: { balance: 100n, reservedBalance: 0n } });
      await db.job.create({ data: { id: jobId, userId: customerId, name: 'idem-test', quotedPriceCentsPerHour: 40 } });
      await service.reserveFunds(jobId, customerId, 40n);

      const assign1 = uuidv4();
const m2Id = uuidv4(); await db.machine.create({ data: { id: m2Id, name: 'm1', hostname: 'h1', operatingSystem: 'linux', architecture: 'amd64', region: 'us', providerId: (await db.provider.findFirst({where: {userId: providerId}})).id } }); await db.jobAssignment.create({ data: { id: assign1, jobId, machineId: m2Id, providerId: (await db.provider.findFirst({where: {userId: providerId}})).id } });

      await db.billingSegment.create({
        data: {
          jobId, assignmentId: assign1, providerWalletId: providerWalletId,
          status: 'COMPLETED', actualDurationMs: 3600000n,
          flatCentsPerHour: 50, cpuCentsPerHour: 0, memoryGbCentsPerHour: 0, gpuCentsPerHour: 0, requestedCpuCores: 0, requestedMemoryGb: 0, requestedGpuCount: 0,
          minBillingMinutes: 15
        }
      });

      const res1 = await service.settleJob(jobId, customerId);
      const res2 = await service.settleJob(jobId, customerId);
      
      // Both return but second one is cached result essentially, or just ignores
      expect(res1.id || res1.amount).toBeDefined();
      
      const txs = await db.financialTransaction.findMany({ where: { referenceId: jobId, type: 'SETTLEMENT' }});
      expect(txs.length).toBe(1); // exactly one financial transaction created
    });
  });
});
