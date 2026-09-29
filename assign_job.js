const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const job = await prisma.job.findUnique({ where: { id: 'b5efcf34-1d81-45c0-97f7-3f11dd6a7397' } });
  const machineId = require('fs').readFileSync('../../test-machine-id.txt', 'utf8').trim();
  const machine = await prisma.machine.findUnique({ where: { id: machineId } });
  
  await prisma.job.update({ where: { id: job.id }, data: { status: 'ASSIGNED' } });
  
  await prisma.jobAssignment.create({
    data: {
      jobId: job.id,
      machineId: machine.id,
      providerId: machine.providerId,
      status: 'ACTIVE'
    }
  });
  console.log('Job assigned manually!');
}
run().catch(console.error).finally(() => prisma.$disconnect());
