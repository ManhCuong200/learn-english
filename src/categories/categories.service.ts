import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    const existingCategory = await this.prisma.category.findFirst({
      where: {
        OR: [{ name }, { slug }],
      },
    });

    if (existingCategory) {
      throw new ConflictException('Category name or slug already exists');
    }

    return this.prisma.category.create({
      data: {
        name,
        slug,
      },
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            words: true,
          },
        },
      },
    });
  }

  async findOneBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: {
        slug: slug.trim().toLowerCase(),
      },
      include: {
        _count: {
          select: {
            words: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    const name = dto.name?.trim();
    const slug = dto.slug?.trim().toLowerCase();

    if (name || slug) {
      const duplicateCategory = await this.prisma.category.findFirst({
        where: {
          OR: [
            ...(name ? [{ name }] : []),
            ...(slug ? [{ slug }] : []),
          ],
          NOT: {
            id,
          },
        },
      });

      if (duplicateCategory) {
        throw new ConflictException(
          'Category name or slug already exists',
        );
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
      },
    });
  }

  async remove(id: string) {
    const existingCategory = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }
}