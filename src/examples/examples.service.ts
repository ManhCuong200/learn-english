import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateExampleDto } from './dto/create-example.dto';
import { UpdateExampleDto } from './dto/update-example.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExamplesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(wordId: string, createExampleDto: CreateExampleDto) {
    const word = await this.prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      throw new NotFoundException('Word not found');
    }

    return this.prisma.example.create({
      data: {
        content: createExampleDto.content,
        meaning: createExampleDto.meaning,
        wordId,
      },
    });
  }

  async findAllByWord(wordId: string) {
    return this.prisma.example.findMany({
      where: { wordId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, updateExampleDto: UpdateExampleDto) {
    const example = await this.prisma.example.findUnique({ where: { id } });
    if (!example) {
      throw new NotFoundException('Example not found');
    }

    return this.prisma.example.update({
      where: { id },
      data: {
        ...(updateExampleDto.content !== undefined && {
          content: updateExampleDto.content,
        }),
        ...(updateExampleDto.meaning !== undefined && {
          meaning: updateExampleDto.meaning,
        }),
      },
    });
  }

  async remove(id: string) {
    const example = await this.prisma.example.findUnique({ where: { id } });
    if (!example) {
      throw new NotFoundException('Example not found');
    }

    return this.prisma.example.delete({
      where: { id },
    });
  }
}
