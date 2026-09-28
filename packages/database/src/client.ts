import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | undefined;

export function getDatabaseClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.APP_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error'] 
        : ['warn', 'error'],
    });
  }
  return prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
