import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LearningActivityType, WordProgressStatus } from '@prisma/client';

export interface QuizAnswerItem {
  wordId: string;
  isCorrect: boolean;
}

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  async getQuizQuestions(userId: string, limit = 5) {
    const allWords = await this.prisma.word.findMany({
      include: {
        category: true,
      },
    });

    if (allWords.length < 4) {
      throw new NotFoundException('Not enough words available to generate a quiz');
    }

    const shuffled = [...allWords].sort(() => 0.5 - Math.random());
    const selectedWords = shuffled.slice(0, Math.min(limit, allWords.length));

    const questions = selectedWords.map((word) => {
      const otherWords = allWords.filter((w) => w.id !== word.id);
      const shuffledOthers = [...otherWords].sort(() => 0.5 - Math.random());
      const distractors = shuffledOthers.slice(0, 3).map((w) => w.meaning);

      const allOptions = [
        { id: 'correct', text: word.meaning, isCorrect: true },
        ...distractors.map((text, idx) => ({
          id: `distractor-${idx}`,
          text,
          isCorrect: false,
        })),
      ].sort(() => 0.5 - Math.random());

      return {
        id: word.id,
        word: word.word,
        pronunciation: word.pronunciation,
        level: word.level,
        category: word.category?.name,
        options: allOptions,
      };
    });

    return {
      data: questions,
      meta: {
        total: questions.length,
      },
    };
  }

  async submitQuiz(userId: string, answers: QuizAnswerItem[]) {
    if (!answers || answers.length === 0) {
      return { score: 0, correctCount: 0, totalQuestions: 0 };
    }

    const totalQuestions = answers.length;
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const score = Math.round((correctCount / totalQuestions) * 100);

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const answer of answers) {
        const status = answer.isCorrect
          ? WordProgressStatus.REVIEW
          : WordProgressStatus.LEARNING;

        await tx.wordProgress.upsert({
          where: {
            userId_wordId: { userId, wordId: answer.wordId },
          },
          update: {
            status,
            lastReviewedAt: now,
            reviewCount: { increment: 1 },
          },
          create: {
            userId,
            wordId: answer.wordId,
            status,
            lastReviewedAt: now,
            reviewCount: 1,
          },
        });
      }

      await tx.learningHistory.create({
        data: {
          userId,
          type: LearningActivityType.QUIZ,
          title: 'Completed Vocabulary Quiz',
          description: `Scored ${score}% (${correctCount}/${totalQuestions} correct)`,
          createdAt: now,
        },
      });
    });

    return {
      score,
      correctCount,
      totalQuestions,
    };
  }
}
