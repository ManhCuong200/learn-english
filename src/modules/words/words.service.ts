import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { BulkCrawlDto } from './dto/bulk-crawl.dto';

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
      const wordRecord = word as Record<string, unknown>;
      const wordProgresses = wordRecord.wordProgresses as
        | Array<{
            status: string;
            reviewCount: number;
            lastReviewedAt: Date | null;
          }>
        | undefined;
      const firstProgress = wordProgresses?.[0];
      const progress = firstProgress
        ? {
            status: firstProgress.status,
            reviewCount: firstProgress.reviewCount,
            lastReviewedAt: firstProgress.lastReviewedAt,
          }
        : {
            status: 'NEW',
            reviewCount: 0,
            lastReviewedAt: null,
          };

      const wordData = { ...wordRecord };
      delete wordData.wordProgresses;
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

    const wordRecord = word as Record<string, unknown>;
    const wordProgresses = wordRecord.wordProgresses as
      | Array<{
          status: string;
          reviewCount: number;
          lastReviewedAt: Date | null;
        }>
      | undefined;
    const firstProgress = wordProgresses?.[0];
    const progress = firstProgress
      ? {
          status: firstProgress.status,
          reviewCount: firstProgress.reviewCount,
          lastReviewedAt: firstProgress.lastReviewedAt,
        }
      : {
          status: 'NEW',
          reviewCount: 0,
          lastReviewedAt: null,
        };

    const wordData = { ...wordRecord };
    delete wordData.wordProgresses;
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

    const newIpa =
      dto.ipa !== undefined || dto.pronunciation !== undefined
        ? (dto.ipa ?? dto.pronunciation)?.trim() || null
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

  async fetchWordInfo(wordStr: string) {
    const cleanWord = wordStr.trim().toLowerCase();
    if (!cleanWord) {
      throw new BadRequestException('Word parameter is required');
    }

    let ipa: string | null = null;
    let englishExample = '';

    // 1. Fetch IPA & Example from Free Dictionary API
    try {
      const dictRes = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`,
      );
      if (dictRes.ok) {
        const dictData = (await dictRes.json()) as Array<{
          phonetic?: string;
          phonetics?: Array<{ text?: string }>;
          meanings?: Array<{
            definitions?: Array<{ example?: string }>;
          }>;
        }>;
        if (Array.isArray(dictData) && dictData.length > 0) {
          const entry = dictData[0];
          ipa =
            entry.phonetic ||
            entry.phonetics?.find((p) => Boolean(p.text))?.text ||
            null;

          const firstMeaning = entry.meanings?.[0];
          if (
            firstMeaning?.definitions &&
            firstMeaning.definitions.length > 0
          ) {
            const defObj =
              firstMeaning.definitions.find((d) => Boolean(d.example)) ||
              firstMeaning.definitions[0];
            englishExample = defObj.example || '';
          }
        }
      }
    } catch {
      // Ignore network errors
    }

    // 2. Fetch Vietnamese meaning via MyMemory Translate API
    let meaning = cleanWord;
    try {
      const transRes = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanWord)}&langpair=en|vi`,
      );
      if (transRes.ok) {
        const transData = (await transRes.json()) as {
          responseData?: { translatedText?: string };
        };
        const translated = transData?.responseData?.translatedText;
        if (
          translated &&
          typeof translated === 'string' &&
          !translated.includes('MYMEMORY WARNING')
        ) {
          meaning = translated.toLowerCase();
        }
      }
    } catch {
      // Ignore translation errors
    }

    // 3. Translate example sentence if available
    let exampleMeaning = '';
    if (englishExample) {
      try {
        const exTransRes = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishExample)}&langpair=en|vi`,
        );
        if (exTransRes.ok) {
          const exTransData = (await exTransRes.json()) as {
            responseData?: { translatedText?: string };
          };
          const exTranslated = exTransData?.responseData?.translatedText;
          if (
            exTranslated &&
            typeof exTranslated === 'string' &&
            !exTranslated.includes('MYMEMORY WARNING')
          ) {
            exampleMeaning = exTranslated;
          }
        }
      } catch {
        // Ignore
      }
    }

    const level =
      cleanWord.length <= 5 ? 'A1' : cleanWord.length <= 8 ? 'B1' : 'C1';

    return {
      word: cleanWord,
      meaning,
      ipa,
      level,
      examples: englishExample
        ? [{ content: englishExample, meaning: exampleMeaning || null }]
        : [],
    };
  }

  async bulkCrawl(dto: BulkCrawlDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const uniqueWords = Array.from(
      new Set(dto.words.map((w) => w.trim().toLowerCase())),
    ).filter(Boolean);

    const createdWords: unknown[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const wordStr of uniqueWords) {
      try {
        const info = await this.fetchWordInfo(wordStr);

        const existing = await this.prisma.word.findFirst({
          where: { word: { equals: info.word, mode: 'insensitive' } },
        });

        if (existing) {
          const updated = await this.prisma.word.update({
            where: { id: existing.id },
            data: {
              ...(info.ipa &&
                !existing.ipa && { ipa: info.ipa, pronunciation: info.ipa }),
              ...(info.meaning &&
                existing.meaning === existing.word && {
                  meaning: info.meaning,
                }),
            },
            include: { category: true, examples: true },
          });
          createdWords.push(updated);
        } else {
          const newWord = await this.prisma.word.create({
            data: {
              word: info.word,
              meaning: info.meaning,
              ipa: info.ipa,
              pronunciation: info.ipa,
              level: info.level,
              categoryId: dto.categoryId,
              ...(info.examples.length > 0 && {
                examples: {
                  create: info.examples.map((ex) => ({
                    content: ex.content,
                    meaning: ex.meaning,
                  })),
                },
              }),
            },
            include: { category: true, examples: true },
          });
          createdWords.push(newWord);
        }

        successCount++;
        // Small delay to prevent rate limits
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch {
        failedCount++;
      }
    }

    return {
      message: `Crawled ${successCount} words successfully (${failedCount} failed)`,
      successCount,
      failedCount,
      total: uniqueWords.length,
      words: createdWords,
    };
  }
}
