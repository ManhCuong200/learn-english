import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { LearningActivityType } from '@prisma/client';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { AdminQuizQueryDto } from './dto/admin-quiz-query.dto';
import { CreateQuizQuestionDto } from './dto/create-quiz-question.dto';
import { UpdateQuizQuestionDto } from './dto/update-quiz-question.dto';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin: Create a new Quiz (supports optional initial questions atomically)
   */
  async createQuiz(dto: CreateQuizDto) {
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const questionsToCreate = dto.questions || [];

    // Pre-validate questions if provided
    if (questionsToCreate.length > 0) {
      const wordIds = Array.from(
        new Set(questionsToCreate.map((q) => q.wordId)),
      );
      const existingWords = await this.prisma.word.findMany({
        where: { id: { in: wordIds } },
        select: { id: true },
      });
      const validWordIdSet = new Set(existingWords.map((w) => w.id));

      for (let i = 0; i < questionsToCreate.length; i++) {
        const q = questionsToCreate[i];
        if (!validWordIdSet.has(q.wordId)) {
          throw new NotFoundException(
            `Word not found for question at index ${i}`,
          );
        }
        const options = q.options.map((o) => o.trim());
        if (options.length !== 4) {
          throw new BadRequestException(
            `Question ${i + 1}: Options must contain exactly 4 items`,
          );
        }
        const unique = new Set(options.map((o) => o.toLowerCase()));
        if (unique.size !== 4) {
          throw new BadRequestException(
            `Question ${i + 1}: Options must contain 4 unique choices`,
          );
        }
        const trimmedCorrect = q.correctAnswer.trim();
        if (
          !options.some((o) => o.toLowerCase() === trimmedCorrect.toLowerCase())
        ) {
          throw new BadRequestException(
            `Question ${i + 1}: Correct answer must exist in options`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const createdQuiz = await tx.quiz.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          categoryId: dto.categoryId || null,
          level: dto.level?.trim() || null,
          totalQuestions: questionsToCreate.length,
        },
      });

      if (questionsToCreate.length > 0) {
        await tx.quizQuestion.createMany({
          data: questionsToCreate.map((q) => ({
            quizId: createdQuiz.id,
            wordId: q.wordId,
            question: q.question.trim(),
            type: q.type,
            options: q.options.map((o) => o.trim()),
            correctAnswer: q.correctAnswer.trim(),
          })),
        });
      }

      return tx.quiz.findUniqueOrThrow({
        where: { id: createdQuiz.id },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            include: {
              word: {
                select: {
                  id: true,
                  word: true,
                  meaning: true,
                  level: true,
                },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Admin: Get paginated list of quizzes with optional filters
   */
  async getAdminQuizzes(query: AdminQuizQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where = {
      ...(query.search
        ? {
            title: {
              contains: query.search.trim(),
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.level ? { level: query.level } : {}),
    };

    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where,
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
        skip,
        take: limit,
      }),
      this.prisma.quiz.count({ where }),
    ]);

    return {
      data: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        level: q.level,
        category: q.category
          ? {
              id: q.category.id,
              name: q.category.name,
            }
          : null,
        totalQuestions: q.totalQuestions,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: Update Quiz details
   */
  async updateQuiz(id: string, dto: UpdateQuizDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (dto.categoryId && dto.categoryId !== quiz.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    return this.prisma.quiz.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId || null }
          : {}),
        ...(dto.level !== undefined
          ? { level: dto.level?.trim() || null }
          : {}),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Admin: Delete Quiz (cascade deletes questions and attempts)
   */
  async deleteQuiz(id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    await this.prisma.quiz.delete({
      where: { id },
    });

    return { message: 'Quiz deleted successfully' };
  }

  /**
   * Admin: Add a question to Quiz
   */
  async createQuestion(quizId: string, dto: CreateQuizQuestionDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const word = await this.prisma.word.findUnique({
      where: { id: dto.wordId },
    });

    if (!word) {
      throw new NotFoundException('Word not found');
    }

    const options = dto.options.map((o) => o.trim());
    if (options.length !== 4) {
      throw new BadRequestException('Options must contain exactly 4 items');
    }

    const uniqueOptions = new Set(options.map((o) => o.toLowerCase()));
    if (uniqueOptions.size !== 4) {
      throw new BadRequestException('Options must contain 4 unique choices');
    }

    const trimmedCorrectAnswer = dto.correctAnswer.trim();
    if (
      !options.some(
        (o) => o.toLowerCase() === trimmedCorrectAnswer.toLowerCase(),
      )
    ) {
      throw new BadRequestException('Correct answer must exist in options');
    }

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.quizQuestion.create({
        data: {
          quizId,
          wordId: dto.wordId,
          question: dto.question.trim(),
          type: dto.type,
          options: options,
          correctAnswer: trimmedCorrectAnswer,
        },
      });

      await tx.quiz.update({
        where: { id: quizId },
        data: {
          totalQuestions: { increment: 1 },
        },
      });

      return question;
    });
  }

  /**
   * Admin: Update an existing Quiz Question
   */
  async updateQuestion(questionId: string, dto: UpdateQuizQuestionDto) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundException('Quiz question not found');
    }

    if (dto.wordId && dto.wordId !== question.wordId) {
      const word = await this.prisma.word.findUnique({
        where: { id: dto.wordId },
      });
      if (!word) {
        throw new NotFoundException('Word not found');
      }
    }

    const currentOptions = Array.isArray(question.options)
      ? (question.options as string[]).map((o) => String(o).trim())
      : [];

    const newOptions = dto.options
      ? dto.options.map((o) => o.trim())
      : currentOptions;

    if (dto.options !== undefined) {
      if (newOptions.length !== 4) {
        throw new BadRequestException('Options must contain exactly 4 items');
      }

      const uniqueOptions = new Set(newOptions.map((o) => o.toLowerCase()));
      if (uniqueOptions.size !== 4) {
        throw new BadRequestException('Options must contain 4 unique choices');
      }
    }

    const newCorrectAnswer =
      dto.correctAnswer !== undefined
        ? dto.correctAnswer.trim()
        : question.correctAnswer.trim();

    if (
      !newOptions.some(
        (o) => o.toLowerCase() === newCorrectAnswer.toLowerCase(),
      )
    ) {
      throw new BadRequestException('Correct answer must exist in the options');
    }

    return this.prisma.quizQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.wordId !== undefined ? { wordId: dto.wordId } : {}),
        ...(dto.question !== undefined
          ? { question: dto.question.trim() }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.options !== undefined ? { options: newOptions } : {}),
        ...(dto.correctAnswer !== undefined
          ? { correctAnswer: newCorrectAnswer }
          : {}),
      },
    });
  }

  /**
   * Admin: Delete a Quiz Question
   */
  async deleteQuestion(questionId: string) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundException('Quiz question not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.delete({
        where: { id: questionId },
      });

      const quiz = await tx.quiz.findUnique({
        where: { id: question.quizId },
        select: { totalQuestions: true },
      });

      if (quiz && quiz.totalQuestions > 0) {
        await tx.quiz.update({
          where: { id: question.quizId },
          data: {
            totalQuestions: { decrement: 1 },
          },
        });
      }

      return { message: 'Question deleted successfully' };
    });
  }

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
