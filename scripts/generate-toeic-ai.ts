import { PrismaClient, ToeicPart } from '@prisma/client';
import { ToeicAiService } from '../src/modules/toeic/toeic-ai.service';

const prisma = new PrismaClient();
const aiService = new ToeicAiService(prisma as any);

async function main() {
  console.log('=== TOEIC AI GENERATOR CLI ===');

  // Let's generate a focused Part 5 and Part 7 practice set using Gemini AI
  console.log('Generating AI TOEIC Exam (Part 5 & Part 7)...');
  const exam = (await aiService.generateToeicExam({
    title: 'ETS 2024 AI Practice - Business & Management',
    year: 2024,
    series: 'ETS',
    difficulty: 'INTERMEDIATE',
    topic: 'Corporate Finance, Client Communications, Product Launch',
    parts: [ToeicPart.PART_5, ToeicPart.PART_7],
    saveToDatabase: true,
  })) as any;

  console.log(`✅ Successfully generated and saved AI Exam: "${exam?.title}"`);
  console.log(`   ID: ${exam?.id}`);
  console.log(`   Total Questions: ${exam?.totalQuestions}`);
  console.log(`   Passages: ${exam?.passages?.length}`);
  console.log('=== Finished TOEIC AI Generation ===');
}

main()
  .catch((e) => {
    console.error('Error during AI generation:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
