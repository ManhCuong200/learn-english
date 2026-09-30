import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import {
  FlashcardReviewResultType,
  LearningActivityType,
  WordProgressStatus,
} from '@prisma/client';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /progress/overview
   * Calculates overall stats and current learning streak for user
   */
  async getOverview(userId: string) {
    const now = new Date();

    const [
      wordsLearned,
      wordsLearning,
      wordsDue,
      flashcardReviews,
      quizAttempts,
      quizAggregate,
      learningHistory,
    ] = await Promise.all([
      this.prisma.wordProgress.count({
        where: { userId, status: WordProgressStatus.REVIEW },
      }),
      this.prisma.wordProgress.count({
        where: { userId, status: WordProgressStatus.LEARNING },
      }),
      this.prisma.wordProgress.count({
        where: {
          userId,
          status: {
            in: [WordProgressStatus.LEARNING, WordProgressStatus.REVIEW],
          },
          nextReviewAt: {
            lte: now,
          },
        },
      }),
      this.prisma.flashcardReview.count({
        where: { userId },
      }),
      this.prisma.quizAttempt.count({
        where: { userId, completedAt: { not: null } },
      }),
      this.prisma.quizAttempt.aggregate({
        where: { userId, completedAt: { not: null } },
        _avg: { score: true },
      }),
      this.prisma.learningHistory.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const averageQuizScore = Math.round(quizAggregate._avg.score ?? 0);
    const learningStreak = this.calculateStreak(
      learningHistory.map((h) => h.createdAt),
    );

    return {
      wordsLearned,
      wordsLearning,
      wordsDue,
      flashcardReviews,
      quizAttempts,
      averageQuizScore,
      learningStreak,
    };
  }

  /**
   * GET /progress/activity
   * Returns daily activity count grouped by type over requested number of days
   */
  async getActivity(userId: string, days = 7) {
    const startDate = this.getStartDate(days);

    const history = await this.prisma.learningHistory.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        type: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const dateMap = new Map<
      string,
      {
        date: string;
        count: number;
        vocabulary: number;
        flashcard: number;
        quiz: number;
      }
    >();

    // Pre-populate date map for all requested days
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = this.formatDate(d);
      dateMap.set(dateStr, {
        date: dateStr,
        count: 0,
        vocabulary: 0,
        flashcard: 0,
        quiz: 0,
      });
    }

    // Merge actual records
    for (const item of history) {
      const dateStr = this.formatDate(item.createdAt);
      const entry = dateMap.get(dateStr);
      if (entry) {
        entry.count += 1;
        if (item.type === LearningActivityType.VOCABULARY) {
          entry.vocabulary += 1;
        } else if (item.type === LearningActivityType.FLASHCARD) {
          entry.flashcard += 1;
        } else if (item.type === LearningActivityType.QUIZ) {
          entry.quiz += 1;
        }
      }
    }

    const data = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return {
      days,
      data,
    };
  }

  /**
   * GET /progress/vocabulary
   * Returns vocabulary breakdown by status (NEW, LEARNING, REVIEW, total)
   */
  async getVocabularyProgress(userId: string) {
    const [newWords, learningWords, reviewWords] = await Promise.all([
      this.prisma.wordProgress.count({
        where: { userId, status: WordProgressStatus.NEW },
      }),
      this.prisma.wordProgress.count({
        where: { userId, status: WordProgressStatus.LEARNING },
      }),
      this.prisma.wordProgress.count({
        where: { userId, status: WordProgressStatus.REVIEW },
      }),
    ]);

    return {
      newWords,
      learningWords,
      reviewWords,
      total: newWords + learningWords + reviewWords,
    };
  }

  /**
   * GET /progress/flashcards
   * Returns total reviews and breakdown by result (AGAIN, HARD, GOOD, EASY)
   */
  async getFlashcardsProgress(userId: string) {
    const [totalReviews, grouped] = await Promise.all([
      this.prisma.flashcardReview.count({
        where: { userId },
      }),
      this.prisma.flashcardReview.groupBy({
        by: ['result'],
        where: { userId },
        _count: { result: true },
      }),
    ]);

    const countsMap = new Map<string, number>();
    for (const item of grouped) {
      countsMap.set(item.result, item._count.result);
    }

    const allResults: FlashcardReviewResultType[] = [
      'AGAIN',
      'HARD',
      'GOOD',
      'EASY',
    ];

    const results = allResults.map((resultType) => ({
      result: resultType,
      count: countsMap.get(resultType) || 0,
    }));

    return {
      totalReviews,
      results,
    };
  }

  /**
   * GET /progress/quizzes
   * Returns quiz stats: completed attempts, average score, and best score
   */
  async getQuizzesProgress(userId: string) {
    const aggregate = await this.prisma.quizAttempt.aggregate({
      where: {
        userId,
        completedAt: { not: null },
      },
      _count: { id: true },
      _avg: { score: true },
      _max: { score: true },
    });

    const attempts = aggregate._count.id;
    const averageScore = Math.round(aggregate._avg.score ?? 0);
    const bestScore = aggregate._max.score ?? 0;

    return {
      attempts,
      averageScore,
      bestScore,
    };
  }

  /**
   * Calculates continuous learning streak ending today
   */
  private calculateStreak(dates: Date[]): number {
    if (!dates || dates.length === 0) return 0;

    const uniqueDates = new Set(dates.map((d) => this.formatDate(d)));
    const now = new Date();
    const todayStr = this.formatDate(now);

    if (!uniqueDates.has(todayStr)) {
      return 0;
    }

    let streak = 0;
    const checkDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    while (true) {
      const checkStr = this.formatDate(checkDate);
      if (uniqueDates.has(checkStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Helper to format Date as YYYY-MM-DD in local calendar time.
   * Note: Date grouping uses local calendar date. Production multi-region deployments should harmonize user timezones.
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Helper to get start date for N days (beginning of N-1 days ago)
   */
  private getStartDate(days: number): Date {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (days - 1),
      0,
      0,
      0,
      0,
    );
  }
}
