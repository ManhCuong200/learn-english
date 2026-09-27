import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';

@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWordDto) {
    const category = await this.prisma.category.findUnique({
      where: {
        id: dto.categoryId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const ipaVal = (dto.ipa ?? dto.pronunciation)?.trim() || null;

    return this.prisma.word.create({
      data: {
        word: dto.word.trim(),
        meaning: dto.meaning.trim(),
        pronunciation: ipaVal,
        ipa: ipaVal,
        level: dto.level?.trim(),
        categoryId: dto.categoryId,
      },
      include: {
        category: true,
      },
    });
  }

  async findAll(userId?: string) {
    const words = await this.prisma.word.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        category: true,
        examples: true,
        ...(userId && {
          wordProgresses: {
            where: { userId },
          },
        }),
      },
    });

    if (!userId) return words;

    return words.map((word) => {
      const progress = (word as any).wordProgresses?.[0] || {
        status: 'NEW',
        reviewCount: 0,
        lastReviewedAt: null,
      };
      const { wordProgresses, ...wordData } = word as any;
      return {
        ...wordData,
        progress,
      };
    });
  }

  async findOne(id: string, userId?: string) {
    const word = await this.prisma.word.findUnique({
      where: {
        id,
      },
      include: {
        category: true,
        examples: true,
        ...(userId && {
          wordProgresses: {
            where: { userId },
          },
        }),
      },
    });

    if (!word) {
      throw new NotFoundException('Word not found');
    }

    if (!userId) return word;

    const progress = (word as any).wordProgresses?.[0] || {
      status: 'NEW',
      reviewCount: 0,
      lastReviewedAt: null,
    };
    const { wordProgresses, ...wordData } = word as any;
    return {
      ...wordData,
      progress,
    };
  }

  async markAsLearned(userId: string, wordId: string) {
    const word = await this.prisma.word.findUnique({
      where: { id: wordId },
    });

    if (!word) {
      throw new NotFoundException('Word not found');
    }

    const now = new Date();

    const progress = await this.prisma.$transaction(async (tx) => {
      const updatedProgress = await tx.wordProgress.upsert({
        where: {
          userId_wordId: { userId, wordId },
        },
        update: {
          status: 'REVIEW',
          lastReviewedAt: now,
          reviewCount: { increment: 1 },
        },
        create: {
          userId,
          wordId,
          status: 'REVIEW',
          lastReviewedAt: now,
          reviewCount: 1,
        },
      });

      await tx.learningHistory.create({
        data: {
          userId,
          type: 'VOCABULARY',
          title: `Learned vocabulary: ${word.word}`,
          description: word.meaning,
          referenceId: wordId,
          createdAt: now,
        },
      });

      return updatedProgress;
    });

    return {
      message: 'Word marked as learned',
      progress,
    };
  }

  async update(id: string, dto: UpdateWordDto) {
    const existingWord = await this.prisma.word.findUnique({
      where: {
        id,
      },
    });

    if (!existingWord) {
      throw new NotFoundException('Word not found');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: {
          id: dto.categoryId,
        },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const newIpa = (dto.ipa !== undefined || dto.pronunciation !== undefined)
      ? ((dto.ipa ?? dto.pronunciation)?.trim() || null)
      : undefined;

    return this.prisma.word.update({
      where: {
        id,
      },
      data: {
        ...(dto.word !== undefined && {
          word: dto.word.trim(),
        }),

        ...(dto.meaning !== undefined && {
          meaning: dto.meaning.trim(),
        }),

        ...(newIpa !== undefined && {
          pronunciation: newIpa,
          ipa: newIpa,
        }),

        ...(dto.level !== undefined && {
          level: dto.level.trim(),
        }),

        ...(dto.categoryId !== undefined && {
          categoryId: dto.categoryId,
        }),
      },
      include: {
        category: true,
        examples: true,
      },
    });
  }

  async remove(id: string) {
    const existingWord = await this.prisma.word.findUnique({
      where: {
        id,
      },
    });

    if (!existingWord) {
      throw new NotFoundException('Word not found');
    }

    return this.prisma.word.delete({
      where: {
        id,
      },
    });
  }

  async search(query: string) {
    const keyword = query.trim();

    if (!keyword) {
      return [];
    }

    return this.prisma.word.findMany({
      where: {
        OR: [
          {
            word: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            meaning: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        word: 'asc',
      },
      include: {
        category: true,
        examples: true,
      },
    });
  }
}
