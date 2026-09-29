const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTest() {
  console.log("Setting up data for Lease Race test...");
  const user = await prisma.user.create({ data: { email: `test-${Date.now()}@example.com`, passwordHash: 'hash' } });
  const provider = await prisma.provider.create({ data: { userId: user.id, displayName: 'Provider' } });
  const machine = await prisma.machine.create({
    data: { providerId: provider.id, name: 'Machine', hostname: 'host', operatingSystem: 'linux', architecture: 'amd64', region: 'us' }
  });
  const job = await prisma.job.create({ data: { userId: user.id, name: 'Job', status: 'RUNNING' } });
  const assignment = await prisma.jobAssignment.create({
    data: { jobId: job.id, machineId: machine.id, providerId: provider.id, status: 'ACTIVE' }
  });
  const lease = await prisma.executionLease.create({
    data: { jobId: job.id, assignmentId: assignment.id, machineId: machine.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 1000 * 60) }
  });
  const cp = await prisma.checkpoint.create({
    data: {
      id: crypto.randomUUID(),
      jobId: job.id, assignmentId: assignment.id, executionLeaseId: lease.id, sequence: 1,
      status: 'VERIFYING', bucket: 'test', storageKey: 'test', sizeBytes: 10, checksumSha256: 'hash'
    }
  });

  console.log("Setup complete. Starting race condition test.");

  // Transaction A: Verification
  const verifyPromise = prisma.$transaction(async (tx) => {
    console.log("[Verify] Locking lease...");
    const leases = await tx.$queryRaw`SELECT * FROM execution_leases WHERE id = ${lease.id} FOR UPDATE`;
    const lockedLease = leases[0];
    
    // Simulate some latency where the other process might try to jump in
    await sleep(2000); 

    if (lockedLease.status !== 'ACTIVE') {
      console.log("[Verify] Lease is not ACTIVE, aborting verification");
      await tx.checkpoint.update({ where: { id: cp.id }, data: { status: 'FAILED' }});
      return 'FAILED_DUE_TO_LEASE';
    }

    console.log("[Verify] Updating checkpoint to VERIFIED");
    await tx.checkpoint.update({ where: { id: cp.id }, data: { status: 'VERIFIED' }});
    return 'VERIFIED';
  });

  // Transaction B: Lease Expiry (starts slightly after A to ensure A gets the lock first)
  const expirePromise = (async () => {
    await sleep(500); // let verify start and lock
    return prisma.$transaction(async (tx) => {
      console.log("[Expiry] Locking lease...");
      const leases = await tx.$queryRaw`SELECT * FROM execution_leases WHERE id = ${lease.id} FOR UPDATE`;
      console.log("[Expiry] Acquired lease lock, setting EXPIRED");
      await tx.executionLease.update({ where: { id: lease.id }, data: { status: 'EXPIRED' }});
      return 'EXPIRED';
    });
  })();

  const [verifyResult, expireResult] = await Promise.all([verifyPromise, expirePromise]);
  console.log(`Verify Result: ${verifyResult}`);
  console.log(`Expire Result: ${expireResult}`);

  const finalCp = await prisma.checkpoint.findUnique({ where: { id: cp.id } });
  console.log(`Final Checkpoint Status: ${finalCp.status}`);

  if (finalCp.status === 'VERIFIED') {
    console.log("PASS: Checkpoint correctly verified because it held the lock before expiry.");
  } else {
    console.error("FAIL: Inconsistent outcome.");
  }
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
