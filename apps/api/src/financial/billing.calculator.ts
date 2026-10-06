export class BillingCalculator {
  static readonly BPS_DIVISOR = 10000n;
  static readonly MS_PER_HOUR = 3600000n;

  static calculateTotalCentsPerHour(
    flatCentsPerHour: number,
    cpuCentsPerHour: number,
    memoryGbCentsPerHour: number,
    gpuCentsPerHour: number,
    requestedCpuCores: number,
    requestedMemoryGb: number,
    requestedGpuCount: number,
  ): bigint {
    const total =
      flatCentsPerHour +
      cpuCentsPerHour * requestedCpuCores +
      memoryGbCentsPerHour * requestedMemoryGb +
      gpuCentsPerHour * requestedGpuCount;
    return BigInt(total);
  }

  static calculateBillableCents(
    billableDurationMs: bigint,
    totalCentsPerHour: bigint,
  ): bigint {
    // Ceiling division for BigInt
    return (
      (billableDurationMs * totalCentsPerHour + (this.MS_PER_HOUR - 1n)) /
      this.MS_PER_HOUR
    );
  }

  static calculateCommissionAndEarnings(
    billedCents: bigint,
    commissionBps: number,
  ): { platformCommission: bigint; providerEarning: bigint } {
    const bps = BigInt(commissionBps);
    // Ceiling division for commission
    const platformCommission = (billedCents * bps + (this.BPS_DIVISOR - 1n)) / this.BPS_DIVISOR;
    const providerEarning = billedCents - platformCommission;
    
    return { platformCommission, providerEarning };
  }

  static calculateBillableDurationMs(
    actualDurationMs: bigint,
    minBillingMinutes: number,
  ): bigint {
    const minMs = BigInt(minBillingMinutes) * 60000n;
    return actualDurationMs > minMs ? actualDurationMs : minMs;
  }
}
