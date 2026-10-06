import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import {
  ExamType,
  LearningActivityType,
  Prisma,
  ToeicPart,
} from '@prisma/client';
import { GetExamsQueryDto } from './dto/get-exams-query.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';
import {
  CreateExamDto,
  CreatePassageDto,
  CreateQuestionDto,
} from './dto/moderator-toeic.dto';
import { ToeicScalerService } from './toeic-scaler.service';

const LISTENING_PARTS: ToeicPart[] = [
  ToeicPart.PART_1,
  ToeicPart.PART_2,
  ToeicPart.PART_3,
  ToeicPart.PART_4,
];

const READING_PARTS: ToeicPart[] = [
  ToeicPart.PART_5,
  ToeicPart.PART_6,
  ToeicPart.PART_7,
];

@Injectable()
export class ToeicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scalerService: ToeicScalerService,
  ) {}

  /**
   * Get list of TOEIC exams with filters and pagination
   */
  async getExams(query: GetExamsQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(50, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ToeicExamWhereInput = {
      isPublished: true,
    };

    if (query.year) {
      where.year = query.year;
    }

    if (query.series) {
      where.series = {
        equals: query.series,
        mode: 'insensitive',
      };
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.difficulty) {
      where.difficulty = {
        equals: query.difficulty,
        mode: 'insensitive',
      };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.toeicExam.count({ where }),
      this.prisma.toeicExam.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ year: 'desc' }, { testNumber: 'asc' }],
        include: {
          _count: {
            select: {
              questions: true,
              passages: true,
              attempts: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single exam summary
   */
  async getExamDetail(idOrSlug: string) {
    const exam = await this.prisma.toeicExam.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        _count: {
          select: {
            questions: true,
            passages: true,
            attempts: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('TOEIC Exam not found');
    }

    // Group question counts by part
    const partStatsRaw = await this.prisma.toeicQuestion.groupBy({
      by: ['part'],
      where: { examId: exam.id },
      _count: { id: true },
    });

    const partCounts = partStatsRaw.reduce(
      (acc, item) => {
        acc[item.part] = item._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      ...exam,
      partCounts,
    };
  }

  /**
   * Get questions for taking the test (sanitizing correct answers & explanations)
   */
  async getExamQuestions(idOrSlug: string, targetPart?: ToeicPart) {
    const exam = await this.prisma.toeicExam.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });

    if (!exam) {
      throw new NotFoundException('TOEIC Exam not found');
    }

    const questionWhere: Prisma.ToeicQuestionWhereInput = {
      examId: exam.id,
    };

    if (targetPart) {
      questionWhere.part = targetPart;
    }

    const questions = await this.prisma.toeicQuestion.findMany({
      where: questionWhere,
      orderBy: { questionNumber: 'asc' },
      select: {
        id: true,
        examId: true,
        passageId: true,
        part: true,
        questionNumber: true,
        questionText: true,
        imageUrl: true,
        audioUrl: true,
        options: true,
        // Exclude correctAnswer, explanation, transcript during exam taking
      },
    });

    const passageWhere: Prisma.ToeicPassageWhereInput = {
      examId: exam.id,
    };

    if (targetPart) {
      passageWhere.part = targetPart;
    }

    const passages = await this.prisma.toeicPassage.findMany({
      where: passageWhere,
      orderBy: { passageNumber: 'asc' },
      select: {
        id: true,
        examId: true,
        part: true,
        passageNumber: true,
        title: true,
        content: true,
        audioUrl: true,
        imageUrl: true,
        // Exclude transcript and translation during exam taking
      },
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        slug: exam.slug,
        year: exam.year,
        series: exam.series,
        duration: targetPart
          ? this.estimatePartDuration(targetPart)
          : exam.duration,
        audioFullUrl: exam.audioFullUrl,
      },
      totalQuestions: questions.length,
      targetPart: targetPart || null,
      passages,
      questions,
    };
  }

  /**
   * Start a new test attempt
   */
  async startExamAttempt(
    userId: string,
    examId: string,
    targetPart?: ToeicPart,
  ) {
    const exam = await this.prisma.toeicExam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    // Count questions for this attempt
    const questionCount = await this.prisma.toeicQuestion.count({
      where: {
        examId: exam.id,
        ...(targetPart ? { part: targetPart } : {}),
      },
    });

    if (questionCount === 0) {
      throw new BadRequestException('Exam has no questions to start');
    }

    const attempt = await this.prisma.toeicExamAttempt.create({
      data: {
        userId,
        examId: exam.id,
        totalQuestions: questionCount,
        targetPart: targetPart || null,
      },
    });

    return {
      attemptId: attempt.id,
      examId: exam.id,
      examTitle: exam.title,
      targetPart: attempt.targetPart,
      totalQuestions: attempt.totalQuestions,
      startedAt: attempt.startedAt,
    };
  }

  /**
   * Submit exam attempt and calculate scaled score
   */
  async submitExamAttempt(
    userId: string,
    attemptId: string,
    submitDto: SubmitExamDto,
  ) {
    const attempt = await this.prisma.toeicExamAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (attempt.userId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to submit this attempt',
      );
    }

    if (attempt.completedAt) {
      throw new BadRequestException('This attempt has already been submitted');
    }

    // Fetch official questions for this exam / targetPart
    const questions = await this.prisma.toeicQuestion.findMany({
      where: {
        examId: attempt.examId,
        ...(attempt.targetPart ? { part: attempt.targetPart } : {}),
      },
      select: {
        id: true,
        part: true,
        correctAnswer: true,
      },
    });

    const submittedAnswerMap = new Map(
      (submitDto.answers || []).map((a) => [a.questionId, a.selectedAnswer]),
    );

    let listeningCorrect = 0;
    let readingCorrect = 0;
    let totalCorrect = 0;

    const partStats: Record<ToeicPart, { total: number; correct: number }> = {
      [ToeicPart.PART_1]: { total: 0, correct: 0 },
      [ToeicPart.PART_2]: { total: 0, correct: 0 },
      [ToeicPart.PART_3]: { total: 0, correct: 0 },
      [ToeicPart.PART_4]: { total: 0, correct: 0 },
      [ToeicPart.PART_5]: { total: 0, correct: 0 },
      [ToeicPart.PART_6]: { total: 0, correct: 0 },
      [ToeicPart.PART_7]: { total: 0, correct: 0 },
    };

    const userAnswersToCreate: Prisma.ToeicUserAnswerCreateManyAttemptInput[] =
      [];

    for (const q of questions) {
      const selected = submittedAnswerMap.get(q.id) || null;
      const isCorrect =
        selected !== null &&
        selected.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase();

      if (isCorrect) {
        totalCorrect++;
        if (LISTENING_PARTS.includes(q.part)) {
          listeningCorrect++;
        } else if (READING_PARTS.includes(q.part)) {
          readingCorrect++;
        }
      }

      // Track part stats
      partStats[q.part].total++;
      if (isCorrect) {
        partStats[q.part].correct++;
      }

      userAnswersToCreate.push({
        questionId: q.id,
        selectedAnswer: selected,
        correctAnswer: q.correctAnswer,
        isCorrect,
      });
    }

    // Calculate Scaled Score using ToeicScalerService
    const scoreResult = await this.scalerService.calculateScore(
      listeningCorrect,
      readingCorrect,
      partStats,
      questions.length,
      totalCorrect,
    );

    // Save answers and update attempt in transaction
    const completedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      // 1. Create all user answers
      if (userAnswersToCreate.length > 0) {
        await tx.toeicUserAnswer.createMany({
          data: userAnswersToCreate.map((ans) => ({
            attemptId: attempt.id,
            questionId: ans.questionId,
            selectedAnswer: ans.selectedAnswer,
            correctAnswer: ans.correctAnswer,
            isCorrect: ans.isCorrect,
          })),
        });
      }

      // 2. Update attempt scores
      await tx.toeicExamAttempt.update({
        where: { id: attempt.id },
        data: {
          correctAnswers: totalCorrect,
          listeningCorrect,
          readingCorrect,
          scoreListening: scoreResult.scoreListening,
          scoreReading: scoreResult.scoreReading,
          totalScore: scoreResult.totalScore,
          timeSpent: Math.max(0, submitDto.timeSpent || 0),
          completedAt,
        },
      });

      // 3. Log to user learning history
      await tx.learningHistory.create({
        data: {
          userId,
          type: LearningActivityType.TOEIC_EXAM,
          title: `Completed ${attempt.exam.title}`,
          description: `Score: ${scoreResult.totalScore}/990 (LC: ${scoreResult.scoreListening}, RC: ${scoreResult.scoreReading}) - Correct: ${totalCorrect}/${questions.length}`,
          referenceId: attempt.id,
        },
      });
    });

    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      targetPart: attempt.targetPart,
      timeSpent: submitDto.timeSpent,
      completedAt,
      score: scoreResult,
    };
  }

  /**
   * Get attempt results with full explanations and review
   */
  async getAttemptDetail(userId: string, attemptId: string) {
    const attempt = await this.prisma.toeicExamAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
        answers: {
          include: {
            question: {
              include: {
                passage: true,
              },
            },
          },
          orderBy: {
            question: {
              questionNumber: 'asc',
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    if (attempt.userId !== userId) {
      throw new ForbiddenException('Not authorized to view this attempt');
    }

    // Build part breakdown
    const partStats: Record<ToeicPart, { total: number; correct: number }> = {
      [ToeicPart.PART_1]: { total: 0, correct: 0 },
      [ToeicPart.PART_2]: { total: 0, correct: 0 },
      [ToeicPart.PART_3]: { total: 0, correct: 0 },
      [ToeicPart.PART_4]: { total: 0, correct: 0 },
      [ToeicPart.PART_5]: { total: 0, correct: 0 },
      [ToeicPart.PART_6]: { total: 0, correct: 0 },
      [ToeicPart.PART_7]: { total: 0, correct: 0 },
    };

    for (const ans of attempt.answers) {
      const part = ans.question.part;
      partStats[part].total++;
      if (ans.isCorrect) {
        partStats[part].correct++;
      }
    }

    const accuracy =
      attempt.totalQuestions > 0
        ? Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100)
        : 0;

    return {
      attemptId: attempt.id,
      exam: {
        id: attempt.exam.id,
        title: attempt.exam.title,
        series: attempt.exam.series,
        year: attempt.exam.year,
      },
      targetPart: attempt.targetPart,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      timeSpent: attempt.timeSpent,
      totalQuestions: attempt.totalQuestions,
      correctAnswers: attempt.correctAnswers,
      accuracy,
      scores: {
        listeningCorrect: attempt.listeningCorrect,
        readingCorrect: attempt.readingCorrect,
        scoreListening: attempt.scoreListening,
        scoreReading: attempt.scoreReading,
        totalScore: attempt.totalScore,
      },
      partStats,
      answers: attempt.answers.map((ans) => ({
        id: ans.id,
        questionId: ans.questionId,
        questionNumber: ans.question.questionNumber,
        part: ans.question.part,
        questionText: ans.question.questionText,
        imageUrl: ans.question.imageUrl,
        audioUrl: ans.question.audioUrl,
        options: ans.question.options,
        selectedAnswer: ans.selectedAnswer,
        correctAnswer: ans.correctAnswer,
        isCorrect: ans.isCorrect,
        explanation: ans.question.explanation,
        transcript: ans.question.transcript,
        passage: ans.question.passage
          ? {
              id: ans.question.passage.id,
              title: ans.question.passage.title,
              content: ans.question.passage.content,
              audioUrl: ans.question.passage.audioUrl,
              imageUrl: ans.question.passage.imageUrl,
              transcript: ans.question.passage.transcript,
              translation: ans.question.passage.translation,
            }
          : null,
      })),
    };
  }

  /**
   * Get user's TOEIC test attempt history
   */
  async getUserAttempts(userId: string) {
    return this.prisma.toeicExamAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            year: true,
            series: true,
            slug: true,
          },
        },
      },
    });
  }

  // ----------------------------------------------------
  // MODERATOR METHODS
  // ----------------------------------------------------

  async createExam(dto: CreateExamDto) {
    const existing = await this.prisma.toeicExam.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException('Exam with this slug already exists');
    }

    return this.prisma.toeicExam.create({
      data: {
        title: dto.title.trim(),
        slug: dto.slug.trim().toLowerCase(),
        description: dto.description?.trim(),
        series: dto.series || 'ETS',
        year: dto.year,
        testNumber: dto.testNumber || 1,
        type: dto.type || ExamType.FULL_TEST,
        duration: dto.duration || 120,
        totalQuestions: dto.totalQuestions || 200,
        audioFullUrl: dto.audioFullUrl,
        difficulty: dto.difficulty || 'INTERMEDIATE',
        isPublished: dto.isPublished ?? true,
      },
    });
  }

  async createPassage(examId: string, dto: CreatePassageDto) {
    const exam = await this.prisma.toeicExam.findUnique({
      where: { id: examId },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return this.prisma.toeicPassage.create({
      data: {
        examId,
        part: dto.part,
        passageNumber: dto.passageNumber,
        title: dto.title?.trim(),
        content: dto.content?.trim(),
        audioUrl: dto.audioUrl,
        imageUrl: dto.imageUrl,
        transcript: dto.transcript?.trim(),
        translation: dto.translation?.trim(),
      },
    });
  }

  async createQuestion(examId: string, dto: CreateQuestionDto) {
    const exam = await this.prisma.toeicExam.findUnique({
      where: { id: examId },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return this.prisma.toeicQuestion.create({
      data: {
        examId,
        passageId: dto.passageId,
        part: dto.part,
        questionNumber: dto.questionNumber,
        questionText: dto.questionText?.trim(),
        imageUrl: dto.imageUrl,
        audioUrl: dto.audioUrl,
        options: dto.options,
        correctAnswer: dto.correctAnswer.trim().toUpperCase(),
        explanation: dto.explanation?.trim(),
        transcript: dto.transcript?.trim(),
      },
    });
  }

  async deleteExam(id: string) {
    return this.prisma.toeicExam.delete({
      where: { id },
    });
  }

  private estimatePartDuration(part: ToeicPart): number {
    switch (part) {
      case ToeicPart.PART_1:
        return 5;
      case ToeicPart.PART_2:
        return 12;
      case ToeicPart.PART_3:
        return 15;
      case ToeicPart.PART_4:
        return 13;
      case ToeicPart.PART_5:
        return 15;
      case ToeicPart.PART_6:
        return 15;
      case ToeicPart.PART_7:
        return 45;
      default:
        return 30;
    }
  }
}
