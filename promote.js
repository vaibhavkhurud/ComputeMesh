const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.user.updateMany({
    where: { email: 'test-provider@example.com' },
    data: { role: 'PROVIDER' }
  });
  console.log('User promoted');
}
run().catch(console.error).finally(() => prisma.$disconnect());
