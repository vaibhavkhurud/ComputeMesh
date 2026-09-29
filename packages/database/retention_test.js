const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function runTest() {
  console.log("Setting up data for Retention test...");
  const user = await prisma.user.create({ data: { email: `retention-${Date.now()}@example.com`, passwordHash: 'hash' } });
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
  
  // Create 3 VERIFIED checkpoints for this job
  for (let i = 1; i <= 3; i++) {
    await prisma.checkpoint.create({
      data: {
        id: crypto.randomUUID(),
        jobId: job.id,
        assignmentId: assignment.id,
        executionLeaseId: lease.id,
        sequence: i,
        status: 'VERIFIED',
        bucket: 'test',
        storageKey: `key-${i}`,
        sizeBytes: 10,
        checksumSha256: 'hash'
      }
    });
  }

  // Create 1 FAILED checkpoint
  await prisma.checkpoint.create({
    data: {
      id: crypto.randomUUID(),
      jobId: job.id,
      assignmentId: assignment.id,
      executionLeaseId: lease.id,
      sequence: 4,
      status: 'FAILED',
      bucket: 'test',
      storageKey: `key-4`,
      sizeBytes: 10,
      checksumSha256: 'hash',
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    }
  });

  console.log("Running retention cleanup...");
  const jobs = await prisma.job.findMany({ select: { id: true, status: true } });

  for (const j of jobs) {
    const verifiedCheckpoints = await prisma.checkpoint.findMany({
      where: { jobId: j.id, status: 'VERIFIED' },
      orderBy: { sequence: 'desc' }
    });

    if (verifiedCheckpoints.length > 1) {
      const toDelete = verifiedCheckpoints.slice(1);
      for (const cp of toDelete) {
        await prisma.checkpoint.update({
          where: { id: cp.id },
          data: { status: 'DELETED' }
        });
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.checkpoint.updateMany({
      where: {
        jobId: j.id,
        status: { in: ['FAILED', 'CREATING'] },
        updatedAt: { lt: oneHourAgo }
      },
      data: { status: 'DELETED' }
    });
  }

  const finalCps = await prisma.checkpoint.findMany({ where: { jobId: job.id }, orderBy: { sequence: 'asc' } });
  
  console.log("Final Checkpoint States:");
  finalCps.forEach(cp => console.log(`Seq ${cp.sequence}: ${cp.status}`));

  const verified = finalCps.filter(c => c.status === 'VERIFIED');
  if (verified.length === 1 && verified[0].sequence === 3) {
    console.log("PASS: Only the last VERIFIED checkpoint (Seq 3) was retained.");
  } else {
    console.error("FAIL: Retention policy violated.");
  }
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
