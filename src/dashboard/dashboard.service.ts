import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WordProgressStatus, LearningActivityType } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 1. Calculate Flashcards Due
    const dueCount = await this.prisma.wordProgress.count({
      where: {
        userId,
        status: { not: WordProgressStatus.NEW },
        nextReviewAt: { lte: now },
      },
    });

    const newWordsCount = await this.prisma.word.count({
      where: {
        wordProgresses: {
          none: { userId }
        }
      }
    });

    // We'll limit quick practice to a standard session size (10)
    const totalToReview = Math.min(10, dueCount + newWordsCount);
    // Rough estimate: 30 seconds per flashcard
    const estimatedMinutes = Math.ceil((totalToReview * 30) / 60);

    // 2. Fetch all learning history to calculate streak and progress
    const allHistory = await this.prisma.learningHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate Streak
    // A streak continues if there's activity today or yesterday.
    let streakDays = 0;
    let currentDateToCheck = new Date(today);
    
    // Group history by date string YYYY-MM-DD
    const activityDates = new Set(
      allHistory.map(h => {
        const d = new Date(h.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })
    );

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (activityDates.has(todayStr) || activityDates.has(yesterdayStr)) {
      let checkDate = activityDates.has(todayStr) ? new Date(today) : new Date(yesterday);
      while (true) {
        const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (activityDates.has(checkStr)) {
          streakDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // 3. Calculate This Week Activity (Mon - Sun)
    // Find Monday of current week
    const currentDay = today.getDay(); // 0 = Sun, 1 = Mon, etc.
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - distanceToMonday);

    const thisWeekActivity = [false, false, false, false, false, false, false];
    let thisWeekMinutes = 0;
    
    const thisWeekDailyMinutes = [0, 0, 0, 0, 0, 0, 0];
    const lastWeekDailyMinutes = [0, 0, 0, 0, 0, 0, 0];

    const mondayLastWeek = new Date(mondayThisWeek);
    mondayLastWeek.setDate(mondayLastWeek.getDate() - 7);

    // Assign rough minutes to each activity type
    const getMinutes = (type: LearningActivityType) => {
      switch (type) {
        case LearningActivityType.FLASHCARD: return 0.5;
        case LearningActivityType.VOCABULARY: return 2;
        case LearningActivityType.QUIZ: return 5;
        default: return 1;
      }
    };

    allHistory.forEach(h => {
      const hDate = new Date(h.createdAt);
      const hDayStart = new Date(hDate.getFullYear(), hDate.getMonth(), hDate.getDate());
      
      const isThisWeek = hDayStart >= mondayThisWeek;
      const isLastWeek = hDayStart >= mondayLastWeek && hDayStart < mondayThisWeek;
      
      const mins = getMinutes(h.type);

      if (isThisWeek) {
        // Find which day of the week it is (0 = Mon, 6 = Sun)
        const dayDiff = Math.floor((hDayStart.getTime() - mondayThisWeek.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff >= 0 && dayDiff <= 6) {
          thisWeekActivity[dayDiff] = true;
          thisWeekDailyMinutes[dayDiff] += mins;
          thisWeekMinutes += mins;
        }
      } else if (isLastWeek) {
        const dayDiff = Math.floor((hDayStart.getTime() - mondayLastWeek.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff >= 0 && dayDiff <= 6) {
          lastWeekDailyMinutes[dayDiff] += mins;
        }
      }
    });

    const hoursThisWeek = Math.round((thisWeekMinutes / 60) * 10) / 10;
    const lastWeekMinutes = lastWeekDailyMinutes.reduce((a, b) => a + b, 0);
    
    let percentVsLastWeek = 0;
    if (lastWeekMinutes === 0 && thisWeekMinutes > 0) percentVsLastWeek = 100;
    else if (lastWeekMinutes > 0) {
      percentVsLastWeek = Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100);
    }

    // Convert this week daily minutes into percentages for the bar chart.
    // Assuming max bar height is the max minutes of the week, or at least 60 mins.
    const maxDaily = Math.max(60, ...thisWeekDailyMinutes);
    const thisWeekDailyPercents = thisWeekDailyMinutes.map(m => Math.round((m / maxDaily) * 100));

    return {
      streak: {
        currentStreak: streakDays,
        thisWeekActivity,
      },
      progress: {
        hoursThisWeek,
        weeklyGoalHours: 6,
        percentVsLastWeek,
        thisWeekDailyPercents,
      },
      flashcard: {
        dueCount: totalToReview,
        estimatedMinutes: estimatedMinutes === 0 && totalToReview > 0 ? 1 : estimatedMinutes,
      }
    };
  }
}
