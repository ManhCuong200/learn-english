import { Test, TestingModule } from '@nestjs/testing';
import { ProgressService } from './progress.service';
import { PrismaService } from '@core/prisma/prisma.service';
import {
  FlashcardReviewResultType,
  LearningActivityType,
} from '@prisma/client';

describe('ProgressService', () => {
  let service: ProgressService;
  let mockPrismaService: {
    wordProgress: { count: jest.Mock };
    flashcardReview: { count: jest.Mock; groupBy: jest.Mock };
    quizAttempt: { count: jest.Mock; aggregate: jest.Mock };
    learningHistory: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrismaService = {
      wordProgress: {
        count: jest.fn(),
      },
      flashcardReview: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      quizAttempt: {
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      learningHistory: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
  });

  describe('getOverview', () => {
    it('should return correct counts, average score, and streak when data exists', async () => {
      mockPrismaService.wordProgress.count
        .mockResolvedValueOnce(10) // REVIEW
        .mockResolvedValueOnce(5) // LEARNING
        .mockResolvedValueOnce(2); // Due

      mockPrismaService.flashcardReview.count.mockResolvedValue(15);
      mockPrismaService.quizAttempt.count.mockResolvedValue(4);
      mockPrismaService.quizAttempt.aggregate.mockResolvedValue({
        _avg: { score: 85.2 },
      });

      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      mockPrismaService.learningHistory.findMany.mockResolvedValue([
        { createdAt: now },
        { createdAt: yesterday },
      ]);

      const result = await service.getOverview('user-1');

      expect(result.wordsLearned).toBe(10);
      expect(result.wordsLearning).toBe(5);
      expect(result.wordsDue).toBe(2);
      expect(result.flashcardReviews).toBe(15);
      expect(result.quizAttempts).toBe(4);
      expect(result.averageQuizScore).toBe(85);
      expect(result.learningStreak).toBe(2);
    });

    it('should handle zero activity user cleanly', async () => {
      mockPrismaService.wordProgress.count.mockResolvedValue(0);
      mockPrismaService.flashcardReview.count.mockResolvedValue(0);
      mockPrismaService.quizAttempt.count.mockResolvedValue(0);
      mockPrismaService.quizAttempt.aggregate.mockResolvedValue({
        _avg: { score: null },
      });
      mockPrismaService.learningHistory.findMany.mockResolvedValue([]);

      const result = await service.getOverview('user-empty');

      expect(result.wordsLearned).toBe(0);
      expect(result.wordsLearning).toBe(0);
      expect(result.wordsDue).toBe(0);
      expect(result.flashcardReviews).toBe(0);
      expect(result.quizAttempts).toBe(0);
      expect(result.averageQuizScore).toBe(0);
      expect(result.learningStreak).toBe(0);
    });
  });

  describe('getActivity', () => {
    it('should fill all requested days even if zero activity exists', async () => {
      mockPrismaService.learningHistory.findMany.mockResolvedValue([]);

      const result = await service.getActivity('user-1', 7);

      expect(result.days).toBe(7);
      expect(result.data).toHaveLength(7);
      expect(result.data[0].count).toBe(0);
      expect(result.data[6].count).toBe(0);
    });

    it('should map activities to dates accurately', async () => {
      const now = new Date();
      mockPrismaService.learningHistory.findMany.mockResolvedValue([
        { type: LearningActivityType.VOCABULARY, createdAt: now },
        { type: LearningActivityType.FLASHCARD, createdAt: now },
        { type: LearningActivityType.QUIZ, createdAt: now },
      ]);

      const result = await service.getActivity('user-1', 7);

      const todayEntry = result.data[result.data.length - 1];
      expect(todayEntry.count).toBe(3);
      expect(todayEntry.vocabulary).toBe(1);
      expect(todayEntry.flashcard).toBe(1);
      expect(todayEntry.quiz).toBe(1);
    });
  });

  describe('getVocabularyProgress', () => {
    it('should sum new, learning, and review words', async () => {
      mockPrismaService.wordProgress.count
        .mockResolvedValueOnce(3) // NEW
        .mockResolvedValueOnce(4) // LEARNING
        .mockResolvedValueOnce(5); // REVIEW

      const result = await service.getVocabularyProgress('user-1');

      expect(result.newWords).toBe(3);
      expect(result.learningWords).toBe(4);
      expect(result.reviewWords).toBe(5);
      expect(result.total).toBe(12);
    });
  });

  describe('getFlashcardsProgress', () => {
    it('should return all 4 result categories (AGAIN, HARD, GOOD, EASY)', async () => {
      mockPrismaService.flashcardReview.count.mockResolvedValue(10);
      mockPrismaService.flashcardReview.groupBy.mockResolvedValue([
        { result: FlashcardReviewResultType.GOOD, _count: { result: 7 } },
        { result: FlashcardReviewResultType.EASY, _count: { result: 3 } },
      ]);

      const result = await service.getFlashcardsProgress('user-1');

      expect(result.totalReviews).toBe(10);
      expect(result.results).toEqual([
        { result: 'AGAIN', count: 0 },
        { result: 'HARD', count: 0 },
        { result: 'GOOD', count: 7 },
        { result: 'EASY', count: 3 },
      ]);
    });
  });

  describe('getQuizzesProgress', () => {
    it('should calculate completed attempts, rounded average, and max score', async () => {
      mockPrismaService.quizAttempt.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _avg: { score: 77.6 },
        _max: { score: 95 },
      });

      const result = await service.getQuizzesProgress('user-1');

      expect(result.attempts).toBe(5);
      expect(result.averageScore).toBe(78);
      expect(result.bestScore).toBe(95);
    });

    it('should return zeros for user without attempts', async () => {
      mockPrismaService.quizAttempt.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _avg: { score: null },
        _max: { score: null },
      });

      const result = await service.getQuizzesProgress('user-1');

      expect(result.attempts).toBe(0);
      expect(result.averageScore).toBe(0);
      expect(result.bestScore).toBe(0);
    });
  });
});
