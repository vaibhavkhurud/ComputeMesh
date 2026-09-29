const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function runTest() {
  console.log("Setting up data for concurrency test...");
  
  // Create User
  const user = await prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash'
    }
  });

  // Create Provider
  const providerUser = await prisma.user.create({
    data: {
      email: `prov-${Date.now()}@example.com`,
      passwordHash: 'hash'
    }
  });
  
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.id,
      displayName: 'Provider'
    }
  });

  // Create Machine
  const machine = await prisma.machine.create({
    data: {
      providerId: provider.id,
      name: 'Test Machine',
      hostname: 'test-host',
      operatingSystem: 'linux',
      architecture: 'amd64',
      region: 'us-east'
    }
  });

  // Create Job
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      name: 'Test Job',
      status: 'RUNNING'
    }
  });

  // Create Assignment
  const assignment = await prisma.jobAssignment.create({
    data: {
      jobId: job.id,
      machineId: machine.id,
      providerId: provider.id,
      status: 'ACTIVE'
    }
  });

  // Create Lease
  const lease = await prisma.executionLease.create({
    data: {
      jobId: job.id,
      assignmentId: assignment.id,
      machineId: machine.id,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60) // 1 hour from now
    }
  });

  console.log(`Job ID: ${job.id}`);
  console.log(`Lease ID: ${lease.id}`);

  // Test concurrency
  const numRequests = 20;
  console.log(`Firing ${numRequests} concurrent intent requests...`);

  async function createIntent() {
    return prisma.$transaction(async (tx) => {
      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: { checkpointSequence: { increment: 1 } },
      });

      const sequence = updatedJob.checkpointSequence;
      const checkpointId = crypto.randomUUID();
      const storageKey = `checkpoints/${job.userId}/${job.id}/${checkpointId}.tar.gz`;

      const checkpoint = await tx.checkpoint.create({
        data: {
          id: checkpointId,
          jobId: job.id,
          assignmentId: assignment.id,
          executionLeaseId: lease.id,
          sequence,
          status: 'CREATING',
          bucket: 'computemesh-checkpoints',
          storageKey,
          sizeBytes: 1024,
          checksumSha256: 'dummy'
        }
      });
      return checkpoint.sequence;
    });
  }

  const promises = [];
  for (let i = 0; i < numRequests; i++) {
    promises.push(createIntent());
  }

  const results = await Promise.all(promises);
  console.log("Concurrency results (sequences):", results.sort((a, b) => a - b));

  const check = new Set(results);
  if (check.size === numRequests) {
    console.log("SUCCESS: All sequences are unique.");
  } else {
    console.error("FAILURE: Duplicate sequences found.");
  }

  await prisma.$disconnect();
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
