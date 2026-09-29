const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.job.findUnique({where: {id: 'b5efcf34-1d81-45c0-97f7-3f11dd6a7397'}, include: { leases: true }}).then(console.log).finally(()=>prisma.$disconnect());
