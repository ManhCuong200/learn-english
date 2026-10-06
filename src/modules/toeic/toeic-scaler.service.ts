import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { ToeicPart } from '@prisma/client';

export interface ScoreResult {
  listeningCorrect: number;
  readingCorrect: number;
  scoreListening: number;
  scoreReading: number;
  totalScore: number;
  totalQuestions: number;
  correctAnswers: number;
  partAnalytics: Record<
    ToeicPart,
    {
      total: number;
      correct: number;
      accuracy: number;
    }
  >;
  proficiencyLevel: string;
}

@Injectable()
export class ToeicScalerService {
  private readonly logger = new Logger(ToeicScalerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate Scaled TOEIC Score based on ETS Scoring Scale (10 - 990)
   */
  async calculateScore(
    listeningCorrect: number,
    readingCorrect: number,
    partStats: Record<ToeicPart, { total: number; correct: number }>,
    totalQuestions: number,
    correctAnswers: number,
  ): Promise<ScoreResult> {
    // Try to get scaled score from ToeicScoreConversion database table
    let listeningScore = await this.getListeningScaleFromDb(listeningCorrect);
    let readingScore = await this.getReadingScaleFromDb(readingCorrect);

    // Fallback formula if not in database
    if (listeningScore === null) {
      listeningScore = this.fallbackListeningScale(listeningCorrect);
    }
    if (readingScore === null) {
      readingScore = this.fallbackReadingScale(readingCorrect);
    }

    const totalScore = listeningScore + readingScore;

    // Build analytics per part
    const partAnalytics = {} as Record<
      ToeicPart,
      { total: number; correct: number; accuracy: number }
    >;

    const allParts: ToeicPart[] = [
      ToeicPart.PART_1,
      ToeicPart.PART_2,
      ToeicPart.PART_3,
      ToeicPart.PART_4,
      ToeicPart.PART_5,
      ToeicPart.PART_6,
      ToeicPart.PART_7,
    ];

    for (const part of allParts) {
      const stat = partStats[part] || { total: 0, correct: 0 };
      const accuracy =
        stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      partAnalytics[part] = {
        total: stat.total,
        correct: stat.correct,
        accuracy,
      };
    }

    const proficiencyLevel = this.getProficiencyLevel(totalScore);

    return {
      listeningCorrect,
      readingCorrect,
      scoreListening: listeningScore,
      scoreReading: readingScore,
      totalScore,
      totalQuestions,
      correctAnswers,
      partAnalytics,
      proficiencyLevel,
    };
  }

  private async getListeningScaleFromDb(
    correct: number,
  ): Promise<number | null> {
    try {
      const entry = await this.prisma.toeicScoreConversion.findUnique({
        where: { correctCount: Math.min(100, Math.max(0, correct)) },
      });
      return entry ? entry.listeningScore : null;
    } catch {
      return null;
    }
  }

  private async getReadingScaleFromDb(correct: number): Promise<number | null> {
    try {
      const entry = await this.prisma.toeicScoreConversion.findUnique({
        where: { correctCount: Math.min(100, Math.max(0, correct)) },
      });
      return entry ? entry.readingScore : null;
    } catch {
      return null;
    }
  }

  /**
   * Fallback approximation for listening scale
   */
  private fallbackListeningScale(correct: number): number {
    if (correct <= 6) return 5;
    if (correct >= 93) return 495;
    const score = Math.round(5 + ((correct - 6) / (93 - 6)) * (495 - 5));
    return Math.min(495, Math.max(5, Math.round(score / 5) * 5));
  }

  /**
   * Fallback approximation for reading scale
   */
  private fallbackReadingScale(correct: number): number {
    if (correct <= 9) return 5;
    if (correct >= 97) return 495;
    const score = Math.round(5 + ((correct - 9) / (97 - 9)) * (495 - 5));
    return Math.min(495, Math.max(5, Math.round(score / 5) * 5));
  }

  private getProficiencyLevel(totalScore: number): string {
    if (totalScore >= 905)
      return 'International Professional Proficiency (C1/C2)';
    if (totalScore >= 785) return 'Working Proficiency Plus (B2+)';
    if (totalScore >= 605) return 'Limited Working Proficiency (B1/B2)';
    if (totalScore >= 405) return 'Elementary Proficiency Plus (A2+)';
    if (totalScore >= 255) return 'Elementary Proficiency (A2)';
    return 'Basic / Novice (A1)';
  }
}
