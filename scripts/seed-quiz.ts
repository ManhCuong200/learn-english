import { PrismaClient, QuizQuestionType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding sample Quiz data...');

  // Find or create category
  let category = await prisma.category.findFirst({
    where: { slug: 'work-office' },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'Work & Office',
        slug: 'work-office',
      },
    });
  }

  // Ensure words exist
  let word1 = await prisma.word.findFirst({ where: { word: 'Deadline' } });
  if (!word1) {
    word1 = await prisma.word.create({
      data: {
        word: 'Deadline',
        meaning: 'Hạn chót',
        pronunciation: '/ˈded.laɪn/',
        level: 'B1',
        categoryId: category.id,
      },
    });
  }

  let word2 = await prisma.word.findFirst({ where: { word: 'Meeting' } });
  if (!word2) {
    word2 = await prisma.word.create({
      data: {
        word: 'Meeting',
        meaning: 'Cuộc họp',
        pronunciation: '/ˈmiː.t̬ɪŋ/',
        level: 'A2',
        categoryId: category.id,
      },
    });
  }

  let word3 = await prisma.word.findFirst({ where: { word: 'Opportunity' } });
  if (!word3) {
    word3 = await prisma.word.create({
      data: {
        word: 'Opportunity',
        meaning: 'Cơ hội',
        pronunciation: '/ˌɑː.pɚˈtuː.nə.t̬i/',
        level: 'B2',
        categoryId: category.id,
      },
    });
  }

  // Check if Quiz already exists
  const existingQuiz = await prisma.quiz.findFirst({
    where: { title: 'Vocabulary B1 - Work & Office' },
  });

  if (existingQuiz) {
    console.log(`Quiz already exists: ${existingQuiz.title}`);
    return;
  }

  const quiz = await prisma.quiz.create({
    data: {
      title: 'Vocabulary B1 - Work & Office',
      description: 'Practice essential B1 vocabulary for workplace and office environment.',
      categoryId: category.id,
      level: 'B1',
      totalQuestions: 3,
      questions: {
        create: [
          {
            wordId: word1.id,
            question: "What does 'Deadline' mean?",
            type: QuizQuestionType.MEANING,
            options: ['Hạn chót', 'Cuộc họp', 'Kinh nghiệm', 'Cơ hội'],
            correctAnswer: 'Hạn chót',
          },
          {
            wordId: word2.id,
            question: "Translate 'Cuộc họp' into English:",
            type: QuizQuestionType.TRANSLATION,
            options: ['Deadline', 'Meeting', 'Experience', 'Opportunity'],
            correctAnswer: 'Meeting',
          },
          {
            wordId: word3.id,
            question: "Fill in the blank: 'We have a great _____ to grow our business.'",
            type: QuizQuestionType.FILL_BLANK,
            options: ['Opportunity', 'Deadline', 'Meeting', 'Experience'],
            correctAnswer: 'Opportunity',
          },
        ],
      },
    },
    include: {
      questions: true,
    },
  });

  console.log(`✅ Created Quiz "${quiz.title}" with ${quiz.questions.length} questions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
