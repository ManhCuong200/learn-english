import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LearningActivityType } from '@prisma/client';

@Injectable()
export class LearningHistoryService {
  constructor(private prisma: PrismaService) {}

  async getHistory(userId: string, page: number, limit: number, type?: LearningActivityType) {
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(type && { type }),
    };

    const [data, total] = await Promise.all([
      this.prisma.learningHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.learningHistory.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createHistory(userId: string, data: { type: LearningActivityType; title: string; description: string; referenceId?: string }) {
    return this.prisma.learningHistory.create({
      data: {
        userId,
        type: data.type,
        title: data.title,
        description: data.description,
        referenceId: data.referenceId,
      },
    });
  }
}
