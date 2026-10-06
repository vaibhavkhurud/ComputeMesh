import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import { BillingCalculator } from './billing.calculator';
import * as crypto from 'crypto';


@Injectable()
export class FinancialService {
  private readonly commissionBps = parseInt(process.env.COMMISSION_BPS || '1000', 10);

  async getWallet(userId: string, type: 'CUSTOMER' | 'PROVIDER', requireOwnership = true, authUserId?: string) {
    if (requireOwnership && authUserId && userId !== authUserId) {
      throw new ForbiddenException('Cannot access wallet belonging to another user');
    }
    const db = getDatabaseClient();
    let wallet = await db.wallet.findFirst({ where: { userId, type } });
    if (!wallet) {
      wallet = await db.wallet.create({
        data: {
          userId,
          type,
          currency: 'USD',
          balance: 0n,
          reservedBalance: 0n,
        },
      });
    }
    return wallet;
  }

  async getWalletBalance(userId: string, type: 'CUSTOMER' | 'PROVIDER') {
    const wallet = await this.getWallet(userId, type, true, userId);
    return {
      balance: wallet.balance.toString(),
      reservedBalance: wallet.reservedBalance.toString(),
      availableBalance: (wallet.balance - wallet.reservedBalance).toString(),
      currency: wallet.currency,
    };
  }

  async getTransactions(userId: string, type: 'CUSTOMER' | 'PROVIDER') {
    const db = getDatabaseClient();
    const wallet = await this.getWallet(userId, type, true, userId);
    
    // Get all transactions where a ledger entry affects this wallet
    return await db.financialTransaction.findMany({
      where: {
        entries: { some: { walletId: wallet.id } }
      },
      include: { entries: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getSystemWallet() {
    const db = getDatabaseClient();
    let wallet = await db.wallet.findFirst({ where: { type: 'SYSTEM' } });
    if (!wallet) {
      wallet = await db.wallet.create({
        data: {
          type: 'SYSTEM',
          currency: 'USD',
          balance: 0n,
          reservedBalance: 0n,
        },
      });
    }
    return wallet;
  }

  async reserveFunds(jobId: string, customerId: string, maxCostCents: bigint) {
    const db = getDatabaseClient();
    const idempotencyKey = `job-${jobId}-reserve`;

    // Idempotency check outside tx for speed, but enforced by unique constraint
    const existingTx = await db.financialTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existingTx) return existingTx;

    return await db.$transaction(async (tx) => {
      // Lock customer wallet
      const wallets = await tx.$queryRaw<any[]>`
        SELECT id, balance, "reservedBalance" 
        FROM wallets 
        WHERE "userId" = ${customerId} AND type = 'CUSTOMER'
        FOR NO KEY UPDATE
      `;
      if (!wallets || wallets.length === 0) {
        throw new NotFoundException('Customer wallet not found');
      }
      const wallet = wallets[0];
      const available = BigInt(wallet.balance) - BigInt(wallet.reservedBalance);
      
      if (available < maxCostCents) {
        throw new BadRequestException('Insufficient funds');
      }

      // Perform reservation
      await tx.$queryRaw`
        UPDATE wallets
        SET "reservedBalance" = "reservedBalance" + ${maxCostCents},
            version = version + 1
        WHERE id = ${wallet.id}
      `;

      // Create transaction record
      return await tx.financialTransaction.create({
        data: {
          type: 'RESERVATION',
          status: 'PENDING',
          idempotencyKey,
          referenceId: jobId,
        },
      });
    });
  }

  async settleJob(jobId: string) {
    const db = getDatabaseClient();
    const idempotencyKey = `job-${jobId}-settle`;
    const reserveKey = `job-${jobId}-reserve`;

    const existingSettle = await db.financialTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existingSettle) return existingSettle;

    return await db.$transaction(async (tx) => {
      const reservation = await tx.financialTransaction.findUnique({
        where: { idempotencyKey: reserveKey },
      });
      
      const job = await tx.job.findUnique({ where: { id: jobId } });
      if (!job) throw new NotFoundException('Job not found');
      
      const customerId = job.userId;

      const segments = await tx.billingSegment.findMany({ where: { jobId } });
      if (!segments.length) throw new BadRequestException('No billing segments found');

      // Lock wallets (order: Customer, Provider, System)
      const customerWallet = await tx.$queryRaw<any[]>`SELECT * FROM wallets WHERE "userId" = ${customerId} AND type = 'CUSTOMER' FOR NO KEY UPDATE`;
      const systemWallet = await tx.$queryRaw<any[]>`SELECT * FROM wallets WHERE type = 'SYSTEM' FOR NO KEY UPDATE`;
      
      let finalBillableMs = 0n;
      let winningSegment = null;
      let isAnySuccess = false;

      // Find the successful segment
      for (const seg of segments) {
        if (seg.status === 'COMPLETED') {
          isAnySuccess = true;
          winningSegment = seg;
          break; // Only one succeeds in M10 model
        }
      }

      let totalBillCents = 0n;
      let platformCommission = 0n;
      let providerEarning = 0n;

      if (isAnySuccess && winningSegment) {
        const actualMs = winningSegment.actualDurationMs || 0n;
        finalBillableMs = BillingCalculator.calculateBillableDurationMs(actualMs, winningSegment.minBillingMinutes);
        
        const totalPerHour = BillingCalculator.calculateTotalCentsPerHour(
          winningSegment.flatCentsPerHour,
          winningSegment.cpuCentsPerHour,
          winningSegment.memoryGbCentsPerHour,
          winningSegment.gpuCentsPerHour,
          winningSegment.requestedCpuCores,
          winningSegment.requestedMemoryGb,
          winningSegment.requestedGpuCount,
        );
        
        totalBillCents = BillingCalculator.calculateBillableCents(finalBillableMs, totalPerHour);
        
        const comm = BillingCalculator.calculateCommissionAndEarnings(totalBillCents, this.commissionBps);
        platformCommission = comm.platformCommission;
        providerEarning = comm.providerEarning;

        await tx.billingSegment.update({
          where: { id: winningSegment.id },
          data: {
            billableDurationMs: finalBillableMs,
            billedAmount: totalBillCents,
            providerEarning: providerEarning,
          }
        });
      }

      // Update failed segments
      for (const seg of segments) {
        if (seg.status === 'FAILED') {
          await tx.billingSegment.update({
            where: { id: seg.id },
            data: { billableDurationMs: 0n, billedAmount: 0n, providerEarning: 0n }
          });
        }
      }

      const cW = customerWallet[0];
      const maxReserved = BigInt(job.quotedPriceCentsPerHour || 0); // Simplification for max cost

      // Release reservation
      if (reservation) {
        await tx.$queryRaw`UPDATE wallets SET "reservedBalance" = "reservedBalance" - ${maxReserved} WHERE id = ${cW.id}`;
      }

      if (totalBillCents > 0n && winningSegment) {
        // We have a charge
        const providerWallet = await tx.$queryRaw<any[]>`SELECT * FROM wallets WHERE id = ${winningSegment.providerWalletId} FOR NO KEY UPDATE`;
        const pW = providerWallet[0];
        const sW = systemWallet[0];

        // Mutate balances
        await tx.$queryRaw`UPDATE wallets SET balance = balance - ${totalBillCents} WHERE id = ${cW.id}`;
        await tx.$queryRaw`UPDATE wallets SET balance = balance + ${providerEarning} WHERE id = ${pW.id}`;
        await tx.$queryRaw`UPDATE wallets SET balance = balance + ${platformCommission} WHERE id = ${sW.id}`;

        const settleTxId = crypto.randomUUID();
        // Insert PENDING tx, then entries, then COMPLETE to satisfy constraints
        await tx.financialTransaction.create({
          data: { id: settleTxId, type: 'SETTLEMENT', status: 'PENDING', idempotencyKey, referenceId: jobId }
        });
        
        await tx.ledgerEntry.createMany({
          data: [
            { transactionId: settleTxId, walletId: cW.id, type: 'DEBIT', amount: totalBillCents },
            { transactionId: settleTxId, walletId: pW.id, type: 'CREDIT', amount: providerEarning },
            { transactionId: settleTxId, walletId: sW.id, type: 'CREDIT', amount: platformCommission },
          ]
        });

        await tx.financialTransaction.update({
          where: { id: settleTxId },
          data: { status: 'PENDING', completedAt: new Date() }
        });
        
        return { settled: true, amount: totalBillCents };
      } else {
        // Zero charge release
        if (reservation) {
           await tx.financialTransaction.update({
             where: { id: reservation.id },
             data: { status: 'REVERSED' }
           });
        }
        return { settled: true, amount: 0n };
      }
    });
  }

  async refundJob(jobId: string) {
    const db = getDatabaseClient();
    const idempotencyKey = `job-${jobId}-refund`;
    
    const existingRefund = await db.financialTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existingRefund) return existingRefund;

    return await db.$transaction(async (tx) => {
      // Find the settlement transaction
      const settlementTx = await tx.financialTransaction.findUnique({
        where: { idempotencyKey: `job-${jobId}-settle` },
        include: { entries: true }
      });

      if (!settlementTx || settlementTx.status !== 'COMPLETED') {
        throw new BadRequestException('Cannot refund a job that has not been settled');
      }

      let customerId, providerId, systemId;
      let total = 0n, earning = 0n, comm = 0n;
      
      for (const entry of settlementTx.entries) {
        const w = await tx.wallet.findUnique({ where: { id: entry.walletId } });
        if (w!.type === 'CUSTOMER') { customerId = w!.id; total = BigInt(entry.amount); }
        if (w!.type === 'PROVIDER') { providerId = w!.id; earning = BigInt(entry.amount); }
        if (w!.type === 'SYSTEM') { systemId = w!.id; comm = BigInt(entry.amount); }
      }

      // Lock wallets
      await tx.$queryRaw`SELECT * FROM wallets WHERE id IN (${customerId}, ${providerId}, ${systemId}) FOR NO KEY UPDATE`;
      
      // Mutate
      await tx.$queryRaw`UPDATE wallets SET balance = balance + ${total} WHERE id = ${customerId}`;
      await tx.$queryRaw`UPDATE wallets SET balance = balance - ${earning} WHERE id = ${providerId}`;
      await tx.$queryRaw`UPDATE wallets SET balance = balance - ${comm} WHERE id = ${systemId}`;

      const refundTxId = crypto.randomUUID();
      await tx.financialTransaction.create({
        data: { id: refundTxId, type: 'REFUND', status: 'PENDING', idempotencyKey, referenceId: jobId }
      });
      
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId: refundTxId, walletId: providerId!, type: 'DEBIT', amount: earning },
          { transactionId: refundTxId, walletId: systemId!, type: 'DEBIT', amount: comm },
          { transactionId: refundTxId, walletId: customerId!, type: 'CREDIT', amount: total },
        ]
      });

      const completed = await tx.financialTransaction.update({
        where: { id: refundTxId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });
      
      return completed;
    });
  }


  async processDeposit(paymentId: string, idempotencyKey: string) {
    const db = getDatabaseClient();

    return await db.$transaction(async (tx) => {
      // CRITICAL 2: Idempotency inside tx
      const existingTx = await tx.financialTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existingTx) return existingTx;

      // 1. Load authoritative payment
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException('Payment not found');
      
      // CRITICAL 5: Do not create duplicate deposits
      if (payment.status === 'SUCCEEDED') {
        throw new BadRequestException('Payment already succeeded without deposit transaction (Anomaly)');
      }

      // CRITICAL 4: Safe system wallet initialization inside tx
      let systemWalletObj = await tx.wallet.findFirst({ where: { type: 'SYSTEM' } });
      if (!systemWalletObj) {
        systemWalletObj = await tx.wallet.create({
          data: {
            userId: null,
            type: 'SYSTEM',
            currency: 'USD',
            balance: 0n,
            reservedBalance: 0n,
          },
        });
      }

      // 2. Lock wallets deterministically by ID to avoid deadlocks
      const walletIds = [payment.walletId, systemWalletObj.id].sort();
      const lockedWallets = new Map();
      
      for (const wId of walletIds) {
        const w = (await tx.$queryRaw<any[]>`SELECT * FROM wallets WHERE id = ${wId} FOR NO KEY UPDATE`)[0];
        if (!w) throw new NotFoundException(`Wallet ${wId} not found`);
        lockedWallets.set(wId, w);
      }

      const customerWallet = lockedWallets.get(payment.walletId);
      const systemWallet = lockedWallets.get(systemWalletObj.id);

      // 3. Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED' },
      });

      // 4. Create Tx
      const finTx = await tx.financialTransaction.create({
        data: {
          type: 'DEPOSIT',
          status: 'PENDING',
          idempotencyKey,
          currency: payment.currency.toUpperCase(),
        },
      });

      // 5. Create Ledger Entries (Balance: Customer CREDIT, System DEBIT)
      await tx.ledgerEntry.createMany({
        data: [
          { transactionId: finTx.id, walletId: customerWallet.id, type: 'CREDIT', amount: payment.amount },
          { transactionId: finTx.id, walletId: systemWallet.id, type: 'DEBIT', amount: payment.amount },
        ],
      });

      // 6. Mutate balances
      await tx.$queryRaw`UPDATE wallets SET balance = balance + ${payment.amount} WHERE id = ${customerWallet.id}`;
      await tx.$queryRaw`UPDATE wallets SET balance = balance - ${payment.amount} WHERE id = ${systemWallet.id}`;

      return await tx.financialTransaction.update({
        where: { id: finTx.id },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });
    });
  }
}
