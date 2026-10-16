const bcrypt = require('bcrypt');
const { PrismaClient, UserRole } = require('@prisma/client');
if (
  process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.includes(':6543') || process.env.DATABASE_URL.includes('pooler.supabase.com')) &&
  !process.env.DATABASE_URL.includes('pgbouncer=true')
) {
  process.env.DATABASE_URL += (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

const prisma = new PrismaClient({
  datasources: process.env.DATABASE_URL ? { db: { url: process.env.DATABASE_URL } } : undefined,
});

async function main() {
  const email = (process.env.MODERATOR_EMAIL || process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const password = process.env.MODERATOR_PASSWORD || process.env.ADMIN_PASSWORD;
  const name = (process.env.MODERATOR_NAME || process.env.ADMIN_NAME)?.trim() || 'Moderator';

  if (!email || !password) {
    console.warn('⚠️  Skipping seed: MODERATOR_EMAIL and MODERATOR_PASSWORD are not configured in environment variables.');
    return;
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
    console.warn('⚠️  Seed moderator encountered an error (continuing startup):', error.message || error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
