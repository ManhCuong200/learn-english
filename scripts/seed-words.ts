import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding starter categories and words to Supabase Production...');

  // 1. Create Categories
  const catBasic = await prisma.category.upsert({
    where: { slug: 'basic-vocabulary' },
    update: {},
    create: {
      name: 'Basic Vocabulary',
      slug: 'basic-vocabulary',
    },
  });

  const catWork = await prisma.category.upsert({
    where: { slug: 'work-office' },
    update: {},
    create: {
      name: 'Work & Office',
      slug: 'work-office',
    },
  });

  // 2. Create Words
  const words = [
    {
      word: 'Hello',
      meaning: 'Xin chào',
      pronunciation: '/həˈloʊ/',
      level: 'A1',
      categoryId: catBasic.id,
    },
    {
      word: 'Thank you',
      meaning: 'Cảm ơn',
      pronunciation: '/ˈθæŋk ˌju/',
      level: 'A1',
      categoryId: catBasic.id,
    },
    {
      word: 'Meeting',
      meaning: 'Cuộc họp',
      pronunciation: '/ˈmiː.t̬ɪŋ/',
      level: 'A2',
      categoryId: catWork.id,
    },
    {
      word: 'Deadline',
      meaning: 'Hạn chót',
      pronunciation: '/ˈded.laɪn/',
      level: 'B1',
      categoryId: catWork.id,
    },
    {
      word: 'Experience',
      meaning: 'Kinh nghiệm',
      pronunciation: '/ɪkˈspɪr.i.əns/',
      level: 'B1',
      categoryId: catWork.id,
    },
    {
      word: 'Opportunity',
      meaning: 'Cơ hội',
      pronunciation: '/ˌɑː.pɚˈtuː.nə.t̬i/',
      level: 'B2',
      categoryId: catWork.id,
    }
  ];

  for (const w of words) {
    const existing = await prisma.word.findFirst({ where: { word: w.word } });
    if (!existing) {
      await prisma.word.create({ data: w });
      console.log(`Created word: ${w.word}`);
    } else {
      console.log(`Word already exists: ${w.word}`);
    }
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
