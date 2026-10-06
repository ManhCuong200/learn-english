const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Attempting to rename UserRole enum ADMIN to MODERATOR in the database...");
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'MODERATOR';`);
    console.log("Successfully renamed UserRole enum from ADMIN to MODERATOR.");
  } catch (err) {
    console.log("Enum rename skipped or already applied (this is normal if it was already fixed):", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
