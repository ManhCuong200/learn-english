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

    return this.prisma.word.create({
      data: {
        word: dto.word.trim(),
        meaning: dto.meaning.trim(),
        pronunciation: dto.pronunciation?.trim(),
        level: dto.level?.trim(),
        categoryId: dto.categoryId,
      },
      include: {
        category: true,
      },
    });
  }

  async findAll() {
    return this.prisma.word.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        category: true,
        examples: true,
      },
    });
  }

  async findOne(id: string) {
    const word = await this.prisma.word.findUnique({
      where: {
        id,
      },
      include: {
        category: true,
        examples: true,
      },
    });

    if (!word) {
      throw new NotFoundException('Word not found');
    }

    return word;
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

        ...(dto.pronunciation !== undefined && {
          pronunciation: dto.pronunciation.trim(),
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
