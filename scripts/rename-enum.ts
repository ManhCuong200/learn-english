import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'MODERATOR'`);
    console.log("Renamed ADMIN to MODERATOR successfully in Postgres.");
  } catch (error) {
    console.error("Error or already renamed:", error);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
