const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany();
    console.dir(users, {depth: null});
}

main().finally(() => prisma.$disconnect());
