const bcrypt = require('bcrypt');
const { PrismaClient, UserRole } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.MODERATOR_EMAIL || process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const password = process.env.MODERATOR_PASSWORD || process.env.ADMIN_PASSWORD;
  const name = (process.env.MODERATOR_NAME || process.env.ADMIN_NAME)?.trim() || 'Moderator';

  if (!email || !password) {
    throw new Error('MODERATOR_EMAIL and MODERATOR_PASSWORD must be configured');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: hashedPassword,
      role: UserRole.MODERATOR,
    },
    create: {
      name,
      email,
      password: hashedPassword,
      role: UserRole.MODERATOR,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  console.log(`Moderator account ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
