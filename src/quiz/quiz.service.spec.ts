import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QuizQuestionType } from '@prisma/client';

describe('QuizService', () => {
  let service: QuizService;
  let prisma: any;

  const mockQuiz = {
    id: 'quiz-1',
    title: 'Vocabulary B1',
    description: 'Test Quiz',
    categoryId: 'cat-1',
    level: 'B1',
    totalQuestions: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: {
      id: 'cat-1',
      name: 'Work',
    },
    questions: [
      {
        id: 'q-1',
        quizId: 'quiz-1',
        wordId: 'w-1',
        question: 'What does Deadline mean?',
        type: QuizQuestionType.MEANING,
        options: ['Hạn chót', 'Cuộc họp'],
        correctAnswer: 'Hạn chót',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'q-2',
        quizId: 'quiz-1',
        wordId: 'w-2',
        question: 'Translate Cuộc họp',
        type: QuizQuestionType.TRANSLATION,
        options: ['Meeting', 'Deadline'],
        correctAnswer: 'Meeting',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  const mockAttempt = {
    id: 'attempt-1',
    userId: 'user-1',
    quizId: 'quiz-1',
    score: 0,
    totalQuestions: 2,
    correctAnswers: 0,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    quiz: mockQuiz,
  };

  beforeEach(async () => {
    prisma = {
      quiz: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      quizAttempt: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      quizAnswer: {
        createMany: jest.fn(),
      },
      learningHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
  });

  describe('getQuizzes', () => {
    it('should return list of quizzes without questions', async () => {
      prisma.quiz.findMany.mockResolvedValue([mockQuiz]);

      const result = await service.getQuizzes('cat-1', 'B1');

      expect(prisma.quiz.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', level: 'B1' },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('questions');
      expect(result.data[0].id).toEqual('quiz-1');
    });
  });

  describe('getQuiz', () => {
    it('should throw NotFoundException if quiz does not exist', async () => {
      prisma.quiz.findUnique.mockResolvedValue(null);

      await expect(service.getQuiz('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return quiz details without correctAnswer in questions', async () => {
      prisma.quiz.findUnique.mockResolvedValue(mockQuiz);

      const result = await service.getQuiz('quiz-1');

      expect(result.id).toBe('quiz-1');
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0]).not.toHaveProperty('correctAnswer');
    });
  });

  describe('startQuiz', () => {
    it('should create attempt and return questions without correctAnswer', async () => {
      prisma.quiz.findUnique.mockResolvedValue(mockQuiz);
      prisma.quizAttempt.create.mockResolvedValue(mockAttempt);

      const result = await service.startQuiz('user-1', 'quiz-1');

      expect(result.attemptId).toBe('attempt-1');
      expect(result.questions[0]).not.toHaveProperty('correctAnswer');
      expect(prisma.quizAttempt.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if quiz has no questions', async () => {
      prisma.quiz.findUnique.mockResolvedValue({
        ...mockQuiz,
        questions: [],
      });

      await expect(service.startQuiz('user-1', 'quiz-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submitQuiz', () => {
    it('should calculate score, create answers, update attempt and record learning history', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(mockAttempt);
      prisma.quizAnswer.createMany.mockResolvedValue({ count: 2 });
      prisma.quizAttempt.update.mockResolvedValue({
        ...mockAttempt,
        score: 100,
        correctAnswers: 2,
        completedAt: new Date(),
      });
      prisma.learningHistory.create.mockResolvedValue({});

      const submitDto = {
        answers: [
          { questionId: 'q-1', selectedAnswer: 'Hạn chót' },
          { questionId: 'q-2', selectedAnswer: 'meeting ' },
        ],
      };

      const result = await service.submitQuiz('user-1', 'attempt-1', submitDto);

      expect(result.result.score).toBe(100);
      expect(result.result.correctAnswers).toBe(2);
      expect(prisma.quizAnswer.createMany).toHaveBeenCalled();
      expect(prisma.learningHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'QUIZ',
          referenceId: 'attempt-1',
        }),
      });
    });

    it('should throw ForbiddenException if user does not own the attempt', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(mockAttempt);

      await expect(
        service.submitQuiz('user-2', 'attempt-1', { answers: [] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if attempt is already completed', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue({
        ...mockAttempt,
        completedAt: new Date(),
      });

      await expect(
        service.submitQuiz('user-1', 'attempt-1', { answers: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on missing answers', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(mockAttempt);

      const submitDto = {
        answers: [{ questionId: 'q-1', selectedAnswer: 'Hạn chót' }],
      };

      await expect(
        service.submitQuiz('user-1', 'attempt-1', submitDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on duplicate question answers', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(mockAttempt);

      const submitDto = {
        answers: [
          { questionId: 'q-1', selectedAnswer: 'Hạn chót' },
          { questionId: 'q-1', selectedAnswer: 'Cuộc họp' },
        ],
      };

      await expect(
        service.submitQuiz('user-1', 'attempt-1', submitDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAttempt', () => {
    it('should return full attempt details for owner', async () => {
      const mockCompletedAttempt = {
        ...mockAttempt,
        completedAt: new Date(),
        answers: [
          {
            questionId: 'q-1',
            selectedAnswer: 'Hạn chót',
            correctAnswer: 'Hạn chót',
            isCorrect: true,
            question: { question: 'What does Deadline mean?' },
          },
        ],
      };

      prisma.quizAttempt.findUnique.mockResolvedValue(mockCompletedAttempt);

      const result = await service.getAttempt('user-1', 'attempt-1');

      expect(result.attemptId).toBe('attempt-1');
      expect(result.answers[0].question).toBe('What does Deadline mean?');
      expect(result.answers[0].isCorrect).toBe(true);
    });

    it('should throw ForbiddenException if user is not attempt owner', async () => {
      prisma.quizAttempt.findUnique.mockResolvedValue(mockAttempt);

      await expect(
        service.getAttempt('other-user', 'attempt-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
