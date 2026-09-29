const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- M8 Concurrency Test ---');
  
  // Create dummy user, provider, machine, job, assignment
  const user = await prisma.user.create({ data: { email: 'm8race@test.com', passwordHash: 'hash', role: 'CUSTOMER' } });
  const provider = await prisma.provider.create({ data: { userId: user.id, displayName: 'M8Race' } });
  const machine = await prisma.machine.create({ data: { providerId: provider.id, name: 'RaceMachine', hostname: 'race', operatingSystem: 'linux', architecture: 'amd64', region: 'us-east-1' } });
  
  const job = await prisma.job.create({ data: { userId: user.id, name: 'RaceJob', status: 'ASSIGNED' } });
  const assignment = await prisma.jobAssignment.create({ data: { jobId: job.id, machineId: machine.id, providerId: provider.id, status: 'ACTIVE' } });

  console.log(`Created Job ${job.id} and Assignment ${assignment.id}`);

  // Test B: Concurrent Duplicate START
  console.log('\nRunning Concurrent Duplicate START...');
  
  // We need to call the actual service or simulate what the service does
  // The service uses SELECT ... FOR UPDATE. We will spawn 3 concurrent raw transactions simulating startExecution.
  
  const startExecutionSim = async (workerId) => {
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        const current = await tx.$queryRaw`SELECT "jobId" FROM "job_assignments" WHERE id = ${assignment.id} AND status = 'ACTIVE' FOR UPDATE`;
        if (!current.length) return false;
        
        const jobs = await tx.$queryRaw`SELECT status FROM jobs WHERE id = ${job.id} FOR UPDATE`;
        if (!jobs.length || jobs[0].status !== 'ASSIGNED') return false;

        await tx.job.update({ where: { id: job.id }, data: { status: 'STARTING' } });
        await tx.$executeRaw`
          INSERT INTO "execution_leases" (
            id, "jobId", "assignmentId", "machineId", 
            "issuedAt", "expiresAt", "lastRenewedAt", 
            status, "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), ${job.id}, ${assignment.id}, ${machine.id},
            NOW(), NOW() + INTERVAL '5 minutes', NOW(),
            'ACTIVE', NOW(), NOW()
          )
        `;
        return true;
      });
      return claimed;
    } catch (e) {
      if (e.code === 'P2002') return 'UNIQUE_CONSTRAINT_FAILED';
      return e.message;
    }
  };

  const results = await Promise.all([
    startExecutionSim(1),
    startExecutionSim(2),
    startExecutionSim(3)
  ]);

  console.log('Concurrent START results:', results);
  
  const activeLeases = await prisma.executionLease.count({ where: { jobId: job.id, status: 'ACTIVE' } });
  console.log(`Active leases in DB: ${activeLeases} (Expected: 1)`);

  const jobFinal = await prisma.job.findUnique({ where: { id: job.id } });
  console.log(`Job status: ${jobFinal.status} (Expected: STARTING)`);

  await prisma.$disconnect();
}

run().catch(console.error);
