import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LearningActivityType } from '@prisma/client';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get list of quizzes filtered by categoryId and/or level
   */
  async getQuizzes(categoryId?: string, level?: string) {
    const quizzes = await this.prisma.quiz.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(level ? { level } : {}),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      data: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        category: q.category
          ? {
              id: q.category.id,
              name: q.category.name,
            }
          : null,
        level: q.level,
        totalQuestions: q.totalQuestions,
      })),
    };
  }

  /**
   * Get single quiz details with questions (excluding correctAnswer)
   */
  async getQuiz(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      category: quiz.category
        ? {
            id: quiz.category.id,
            name: quiz.category.name,
          }
        : null,
      level: quiz.level,
      totalQuestions: quiz.totalQuestions,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        options: q.options,
      })),
    };
  }

  /**
   * Start a quiz attempt for user and return questions without correct answers
   */
  async startQuiz(userId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      throw new BadRequestException('Quiz has no questions');
    }

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        userId,
        quizId: quiz.id,
        score: 0,
        totalQuestions: quiz.questions.length,
        correctAnswers: 0,
        startedAt: new Date(),
      },
    });

    return {
      attemptId: attempt.id,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        totalQuestions: quiz.questions.length,
      },
      questions: quiz.questions.map((q) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        options: q.options,
      })),
      startedAt: attempt.startedAt,
    };
  }

  /**
   * Submit quiz attempt, grade answers, update attempt, and log learning history
   */
  async submitQuiz(
    userId: string,
    attemptId: string,
    submitDto: SubmitQuizDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.findUnique({
        where: { id: attemptId },
        include: {
          quiz: {
            include: {
              questions: {
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
          },
        },
      });

      if (!attempt) {
        throw new NotFoundException('Quiz attempt not found');
      }

      if (attempt.userId !== userId) {
        throw new ForbiddenException(
          'You are not allowed to submit this quiz attempt',
        );
      }

      if (attempt.completedAt !== null) {
        throw new BadRequestException(
          'Quiz attempt has already been completed',
        );
      }

      // Check duplicate question answers
      const submittedQuestionIds = submitDto.answers.map((a) => a.questionId);
      const uniqueQuestionIds = new Set(submittedQuestionIds);
      if (uniqueQuestionIds.size !== submittedQuestionIds.length) {
        throw new BadRequestException(
          'Duplicate answers for the same question are not allowed',
        );
      }

      const quizQuestions = attempt.quiz.questions;
      if (submitDto.answers.length !== quizQuestions.length) {
        throw new BadRequestException('All questions must be answered');
      }

      const quizQuestionMap = new Map(quizQuestions.map((q) => [q.id, q]));
      for (const answer of submitDto.answers) {
        if (!quizQuestionMap.has(answer.questionId)) {
          throw new BadRequestException(
            'Question does not belong to this quiz',
          );
        }
      }

      let correctAnswersCount = 0;
      const answerRecordsToCreate: {
        attemptId: string;
        questionId: string;
        selectedAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
      }[] = [];

      const reviewAnswers: {
        questionId: string;
        selectedAnswer: string;
        correctAnswer: string;
        isCorrect: boolean;
      }[] = [];

      for (const answer of submitDto.answers) {
        const question = quizQuestionMap.get(answer.questionId)!;
        const isCorrect =
          this.normalizeAnswer(answer.selectedAnswer) ===
          this.normalizeAnswer(question.correctAnswer);

        if (isCorrect) {
          correctAnswersCount++;
        }

        answerRecordsToCreate.push({
          attemptId: attempt.id,
          questionId: question.id,
          selectedAnswer: answer.selectedAnswer,
          correctAnswer: question.correctAnswer,
          isCorrect,
        });

        reviewAnswers.push({
          questionId: question.id,
          selectedAnswer: answer.selectedAnswer,
          correctAnswer: question.correctAnswer,
          isCorrect,
        });
      }

      const totalQuestions = quizQuestions.length;
      const score = Math.round((correctAnswersCount / totalQuestions) * 100);
      const now = new Date();

      await tx.quizAnswer.createMany({
        data: answerRecordsToCreate,
      });

      const updatedAttempt = await tx.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          score,
          correctAnswers: correctAnswersCount,
          completedAt: now,
        },
      });

      await tx.learningHistory.create({
        data: {
          userId,
          type: LearningActivityType.QUIZ,
          title: 'Completed Quiz',
          description: `Completed ${attempt.quiz.title} with a score of ${score}%`,
          referenceId: attempt.id,
          createdAt: now,
        },
      });

      return {
        attemptId: updatedAttempt.id,
        quiz: {
          id: attempt.quiz.id,
          title: attempt.quiz.title,
        },
        result: {
          score,
          correctAnswers: correctAnswersCount,
          totalQuestions,
        },
        completedAt: updatedAttempt.completedAt,
        answers: reviewAnswers,
      };
    });
  }

  /**
   * Get single quiz attempt history for the user
   */
  async getAttempt(userId: string, attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
          },
        },
        answers: {
          include: {
            question: {
              select: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Quiz attempt not found');
    }

    if (attempt.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to view this quiz attempt',
      );
    }

    return {
      attemptId: attempt.id,
      quiz: {
        id: attempt.quiz.id,
        title: attempt.quiz.title,
      },
      score: attempt.score,
      correctAnswers: attempt.correctAnswers,
      totalQuestions: attempt.totalQuestions,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      answers: attempt.answers.map((ans) => ({
        questionId: ans.questionId,
        question: ans.question.question,
        selectedAnswer: ans.selectedAnswer,
        correctAnswer: ans.correctAnswer,
        isCorrect: ans.isCorrect,
      })),
    };
  }

  /**
   * Helper to normalize answers for whitespace and casing comparison
   */
  private normalizeAnswer(str: string): string {
    if (!str) return '';
    return str.trim().toLowerCase();
  }
}
