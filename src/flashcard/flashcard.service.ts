import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FlashcardReviewResultType,
  WordProgressStatus,
  LearningActivityType,
} from '@prisma/client';
import { ReviewFlashcardDto } from './dto/review-flashcard.dto';

@Injectable()
export class FlashcardService {
  constructor(private readonly prisma: PrismaService) {}

  async getFlashcards(userId: string, limit: number, categoryId?: string) {
    const whereClause = categoryId ? { categoryId } : {};

    const words = await this.prisma.word.findMany({
      where: whereClause,
      include: {
        category: true,
        wordProgresses: {
          where: { userId },
        },
      },
    });

    const mappedWords = words.map((word) => {
      const progress = word.wordProgresses[0] || {
        status: WordProgressStatus.NEW,
        reviewCount: 0,
        lastReviewedAt: null,
        nextReviewAt: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { wordProgresses, ...wordData } = word;
      return {
        ...wordData,
        progress,
      };
    });

    const now = new Date();

    const newWords = mappedWords.filter(
      (w) => w.progress.status === WordProgressStatus.NEW,
    );
    const dueWords = mappedWords.filter(
      (w) =>
        w.progress.status !== WordProgressStatus.NEW &&
        w.progress.nextReviewAt &&
        w.progress.nextReviewAt <= now,
    );
    const otherWords = mappedWords.filter(
      (w) =>
        w.progress.status !== WordProgressStatus.NEW &&
        (!w.progress.nextReviewAt || w.progress.nextReviewAt > now),
    );

    const sortedWords = [...newWords, ...dueWords, ...otherWords].slice(
      0,
      limit,
    );

    return {
      data: sortedWords,
      meta: {
        total: sortedWords.length,
      },
    };
  }

  async getFlashcard(userId: string, wordId: string) {
    const word = await this.prisma.word.findUnique({
      where: { id: wordId },
      include: {
        category: true,
        wordProgresses: {
          where: { userId },
        },
      },
    });

    if (!word) {
      throw new NotFoundException('Word not found');
    }

    const progress = word.wordProgresses[0] || {
      status: WordProgressStatus.NEW,
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { wordProgresses, ...wordData } = word;

    return {
      ...wordData,
      progress,
    };
  }

  async reviewFlashcard(
    userId: string,
    wordId: string,
    dto: ReviewFlashcardDto,
  ) {
    const word = await this.prisma.word.findUnique({
      where: { id: wordId },
    });

    if (!word) {
      throw new NotFoundException('Word not found');
    }

    const now = new Date();
    const nextReviewAt = new Date(now);
    let status: WordProgressStatus = WordProgressStatus.LEARNING;

    switch (dto.result) {
      case FlashcardReviewResultType.AGAIN:
        nextReviewAt.setMinutes(nextReviewAt.getMinutes() + 10);
        status = WordProgressStatus.LEARNING;
        break;
      case FlashcardReviewResultType.HARD:
        nextReviewAt.setDate(nextReviewAt.getDate() + 1);
        status = WordProgressStatus.LEARNING;
        break;
      case FlashcardReviewResultType.GOOD:
        nextReviewAt.setDate(nextReviewAt.getDate() + 3);
        status = WordProgressStatus.REVIEW;
        break;
      case FlashcardReviewResultType.EASY:
        nextReviewAt.setDate(nextReviewAt.getDate() + 7);
        status = WordProgressStatus.REVIEW;
        break;
    }

    const progress = await this.prisma.$transaction(async (tx) => {
      const updatedProgress = await tx.wordProgress.upsert({
        where: {
          userId_wordId: { userId, wordId },
        },
        update: {
          status,
          nextReviewAt,
          lastReviewedAt: now,
          reviewCount: { increment: 1 },
        },
        create: {
          userId,
          wordId,
          status,
          nextReviewAt,
          lastReviewedAt: now,
          reviewCount: 1,
        },
      });

      await tx.flashcardReview.create({
        data: {
          userId,
          wordId,
          result: dto.result,
          reviewedAt: now,
        },
      });

      await tx.learningHistory.create({
        data: {
          userId,
          type: LearningActivityType.FLASHCARD,
          title: 'Reviewed flashcard',
          description: `Reviewed the word '${word.word}' as ${dto.result}`,
          referenceId: wordId,
          createdAt: now,
        },
      });

      return updatedProgress;
    });

    return {
      message: 'Flashcard reviewed successfully',
      progress: {
        status: progress.status,
        reviewCount: progress.reviewCount,
        lastReviewedAt: progress.lastReviewedAt,
        nextReviewAt: progress.nextReviewAt,
      },
    };
  }
}
