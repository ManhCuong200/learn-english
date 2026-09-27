import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: "postgresql://postgres.cqujdyhzeklnshfrpmql:kR9mP8vL2xT5qW7nY4bC@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
});

async function checkAdmin() {
  const users = await prisma.user.findMany();
  console.log("Users in Supabase DB:", users);
  
  const words = await prisma.word.count();
  console.log("Total words in Supabase DB:", words);
}

checkAdmin().finally(() => prisma.$disconnect());
