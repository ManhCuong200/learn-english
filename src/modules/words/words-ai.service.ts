import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { PrismaService } from '@core/prisma/prisma.service';
import { ExtractPdfDto } from './dto/extract-pdf.dto';
import {
  ExtractedCategoryDto,
  ImportExtractedDto,
} from './dto/import-extracted.dto';

export interface ExtractedWordResult {
  word: string;
  meaning: string;
  ipa?: string;
  level?: string;
  partOfSpeech?: string;
  example?: string;
  exampleMeaning?: string;
}

export interface ExtractedCategoryResult {
  name: string;
  description?: string;
  words: ExtractedWordResult[];
}

export interface ExtractPdfResponse {
  fileName?: string;
  totalCategories: number;
  totalWords: number;
  categories: ExtractedCategoryResult[];
}

export interface ImportExtractedResponse {
  message: string;
  createdCategories: number;
  createdWords: number;
  updatedWords: number;
  totalProcessedWords: number;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

@Injectable()
export class WordsAiService {
  private readonly logger = new Logger(WordsAiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extract categories and vocabulary words directly from uploaded PDF base64 using Gemini AI
   */
  async extractFromPdf(dto: ExtractPdfDto): Promise<ExtractPdfResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key') {
      this.logger.error('GEMINI_API_KEY is not configured on the server');
      throw new InternalServerErrorException(
        'GEMINI_API_KEY is not configured on the server. Please provide a valid Gemini API key.',
      );
    }

    if (!dto.base64) {
      throw new BadRequestException('PDF base64 data is required');
    }

    const cleanBase64 = dto.base64.replace(/^data:[^;]+;base64,/, '');
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a professional English linguist and curriculum designer.
Analyze the provided document (PDF) carefully.
Your mission:
1. Identify all distinct thematic topics or categories of vocabulary words covered in or associated with this document (e.g. "Technology & Innovation", "Business & Finance", "Healthcare & Medicine", "Environment & Ecology", "Daily Conversations", etc.).
2. For each category/topic found:
   - "name": Clean, concise English category name (e.g., "Business & Finance", "Travel & Tourism").
   - "description": Short, informative Vietnamese description summarizing the category topic.
   - "words": All relevant vocabulary words belonging to this category present in the document.
   - For every word, provide:
     * "word": The English word (lowercase, clean lemma, e.g. "collaborate", "resilient")
     * "meaning": Accurate, natural Vietnamese translation
     * "ipa": International Phonetic Alphabet transcription (e.g. "/kəˈlæb.ə.reɪt/")
     * "level": Appropriate CEFR level ("A1", "A2", "B1", "B2", "C1", or "C2")
     * "partOfSpeech": "noun", "verb", "adjective", "adverb", etc.
     * "example": A practical, natural English sentence illustrating the word
     * "exampleMeaning": Vietnamese translation of the example sentence

Ensure high accuracy, natural Vietnamese translations, and comprehensive coverage.
Respond strictly in JSON matching the defined schema.`;

    try {
      this.logger.log(
        `Extracting categories & words from PDF with Gemini model: ${modelName}`,
      );

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: 'application/pdf',
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              categories: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          meaning: { type: Type.STRING },
                          ipa: { type: Type.STRING },
                          level: { type: Type.STRING },
                          partOfSpeech: { type: Type.STRING },
                          example: { type: Type.STRING },
                          exampleMeaning: { type: Type.STRING },
                        },
                        required: ['word', 'meaning', 'ipa', 'level'],
                      },
                    },
                  },
                  required: ['name', 'words'],
                },
              },
            },
            required: ['categories'],
          },
        },
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        throw new InternalServerErrorException(
          'Gemini AI returned an empty response for the PDF extraction.',
        );
      }

      const parsed = JSON.parse(responseText) as {
        categories?: ExtractedCategoryResult[];
      };

      const categories = (parsed.categories || []).filter(
        (cat) => cat.name && Array.isArray(cat.words) && cat.words.length > 0,
      );

      const totalWords = categories.reduce(
        (acc, cat) => acc + cat.words.length,
        0,
      );

      this.logger.log(
        `PDF extraction successful: ${categories.length} categories, ${totalWords} words found`,
      );

      return {
        fileName: dto.fileName || 'uploaded-document.pdf',
        totalCategories: categories.length,
        totalWords,
        categories,
      };
    } catch (err: unknown) {
      const errorObj = err as Error;
      this.logger.error(
        `Failed to extract categories from PDF: ${errorObj.message}`,
        errorObj.stack,
      );
      throw new InternalServerErrorException(
        `AI PDF extraction error: ${errorObj.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Save extracted categories and words into database
   */
  async importExtracted(
    dto: ImportExtractedDto,
  ): Promise<ImportExtractedResponse> {
    if (!dto.categories || dto.categories.length === 0) {
      throw new BadRequestException('No categories provided to import');
    }

    let createdCategoriesCount = 0;
    let createdWordsCount = 0;
    let updatedWordsCount = 0;
    let totalProcessedWords = 0;

    for (const catDto of dto.categories) {
      if (!catDto.name.trim() || !catDto.words || catDto.words.length === 0) {
        continue;
      }

      const baseSlug = generateSlug(catDto.name) || 'topic';

      // Find or create Category
      let category = await this.prisma.category.findFirst({
        where: {
          OR: [
            { name: { equals: catDto.name.trim(), mode: 'insensitive' } },
            { slug: baseSlug },
          ],
        },
      });

      if (!category) {
        let finalSlug = baseSlug;
        let counter = 1;
        while (
          await this.prisma.category.findUnique({ where: { slug: finalSlug } })
        ) {
          finalSlug = `${baseSlug}-${counter++}`;
        }

        category = await this.prisma.category.create({
          data: {
            name: catDto.name.trim(),
            slug: finalSlug,
          },
        });
        createdCategoriesCount++;
      }

      // Upsert Words for this category
      for (const w of catDto.words) {
        const cleanWord = w.word.trim().toLowerCase();
        if (!cleanWord || !w.meaning.trim()) continue;

        totalProcessedWords++;

        const existingWord = await this.prisma.word.findFirst({
          where: { word: { equals: cleanWord, mode: 'insensitive' } },
          include: { examples: true },
        });

        if (existingWord) {
          await this.prisma.word.update({
            where: { id: existingWord.id },
            data: {
              ...(w.ipa && !existingWord.ipa && { ipa: w.ipa, pronunciation: w.ipa }),
              ...(w.meaning &&
                (!existingWord.meaning || existingWord.meaning === existingWord.word) && {
                  meaning: w.meaning.trim(),
                }),
              ...(w.level && !existingWord.level && { level: w.level }),
              categoryId: category.id,
            },
          });

          // Add example if word doesn't have any
          if (w.example && (!existingWord.examples || existingWord.examples.length === 0)) {
            await this.prisma.example.create({
              data: {
                content: w.example.trim(),
                meaning: w.exampleMeaning ? w.exampleMeaning.trim() : null,
                wordId: existingWord.id,
              },
            });
          }

          updatedWordsCount++;
        } else {
          await this.prisma.word.create({
            data: {
              word: cleanWord,
              meaning: w.meaning.trim(),
              ipa: w.ipa || null,
              pronunciation: w.ipa || null,
              level: w.level || 'B1',
              categoryId: category.id,
              ...(w.example
                ? {
                    examples: {
                      create: [
                        {
                          content: w.example.trim(),
                          meaning: w.exampleMeaning
                            ? w.exampleMeaning.trim()
                            : null,
                        },
                      ],
                    },
                  }
                : {}),
            },
          });

          createdWordsCount++;
        }
      }
    }

    return {
      message: `Đã lưu thành công ${createdCategoriesCount} danh mục mới, ${createdWordsCount} từ vựng mới và cập nhật ${updatedWordsCount} từ vựng.`,
      createdCategories: createdCategoriesCount,
      createdWords: createdWordsCount,
      updatedWords: updatedWordsCount,
      totalProcessedWords,
    };
  }
}
