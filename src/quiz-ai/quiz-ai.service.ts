import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { QuizQuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';

export interface GeneratedQuestion {
  wordId: string;
  question: string;
  type: QuizQuestionType;
  options: string[];
  correctAnswer: string;
}

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[];
}

@Injectable()
export class QuizAiService {
  private readonly logger = new Logger(QuizAiService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateQuestions(
    dto: GenerateQuestionsDto,
  ): Promise<GenerateQuestionsResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.error(
        'GEMINI_API_KEY environment variable is not configured',
      );
      throw new InternalServerErrorException(
        'GEMINI_API_KEY is not configured',
      );
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const wordsPool = await this.prisma.word.findMany({
      where: {
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.level ? { level: dto.level } : {}),
      },
      take: 100,
      select: {
        id: true,
        word: true,
        meaning: true,
        pronunciation: true,
        ipa: true,
        level: true,
        categoryId: true,
        examples: {
          select: {
            content: true,
            meaning: true,
          },
        },
      },
    });

    if (wordsPool.length < dto.count) {
      throw new BadRequestException(
        `Only ${wordsPool.length} vocabulary words are available, but ${dto.count} questions were requested`,
      );
    }

    const selectedWords = this.shuffleArray(wordsPool).slice(0, dto.count);
    const validWordIds = new Set(selectedWords.map((w) => w.id));

    const vocabularyPromptList = selectedWords
      .map((w, index) => {
        const examplesStr =
          w.examples.length > 0
            ? ` | Examples: ${w.examples
                .map(
                  (e) => `"${e.content}"${e.meaning ? ` (${e.meaning})` : ''}`,
                )
                .join('; ')}`
            : '';
        return `${index + 1}. wordId: "${w.id}", Word: "${w.word}", Meaning: "${w.meaning}", Level: "${w.level || 'N/A'}"${examplesStr}`;
      })
      .join('\n');

    const allowedTypesStr = dto.types.join(', ');

    const prompt = `You are an expert English learning assessment generator.
Create exactly ${dto.count} quiz questions based ONLY on the vocabulary words provided below.

VOCABULARY SOURCE:
${vocabularyPromptList}

ALLOWED QUESTION TYPES:
[${allowedTypesStr}]

STRICT REQUIREMENTS:
1. Generate exactly ${dto.count} questions.
2. Each question MUST correspond to one of the words listed above, using its exact "wordId".
3. The question "type" MUST be one of: ${allowedTypesStr}.
4. Question Types logic:
   - MEANING: Ask for the definition/meaning of the target word. Options must be 4 meanings (1 correct, 3 plausible distractors).
   - FILL_BLANK: Provide a clear English sentence with "_____" where the target word fits. Options must be 4 English words (1 correct target word, 3 distractors).
   - TRANSLATION: Ask for an accurate translation or contextual sentence meaning for the target word.
5. "options" MUST be an array of EXACTLY 4 distinct non-empty strings. No duplicates allowed.
6. "correctAnswer" MUST be an exact string match to one of the items in "options".
7. DO NOT invent wordId or vocabulary not in the source list.`;

    const ai = new GoogleGenAI({ apiKey });

    let responseText: string | undefined;
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    wordId: { type: Type.STRING },
                    question: { type: Type.STRING },
                    type: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctAnswer: { type: Type.STRING },
                  },
                  required: [
                    'wordId',
                    'question',
                    'type',
                    'options',
                    'correctAnswer',
                  ],
                },
              },
            },
            required: ['questions'],
          },
        },
      });
      responseText = response.text;
    } catch (error) {
      this.logger.error('Gemini API execution failed', error);
      throw new InternalServerErrorException(
        'Failed to generate questions from AI service',
      );
    }

    if (!responseText) {
      this.logger.error('Gemini API returned an empty response');
      throw new InternalServerErrorException(
        'AI service returned empty response',
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (error) {
      this.logger.error('Failed to parse Gemini AI response as JSON', error);
      throw new InternalServerErrorException('AI response was not valid JSON');
    }

    if (!this.isRecord(parsedJson)) {
      this.logger.error('AI response root object structure is invalid');
      throw new InternalServerErrorException(
        'AI response schema structure is invalid',
      );
    }

    const questionsRaw: unknown = parsedJson['questions'];
    if (!Array.isArray(questionsRaw)) {
      this.logger.error('AI response questions field is not an array');
      throw new InternalServerErrorException(
        'AI response questions field is not an array',
      );
    }

    if (questionsRaw.length !== dto.count) {
      this.logger.error(
        `AI generated ${questionsRaw.length} questions, but requested count was ${dto.count}`,
      );
      throw new InternalServerErrorException(
        'AI generated incorrect number of questions',
      );
    }

    const allowedTypesSet = new Set<string>(dto.types);
    const validatedQuestions: GeneratedQuestion[] = [];

    for (let i = 0; i < questionsRaw.length; i++) {
      const q: unknown = questionsRaw[i];

      if (!this.isRecord(q)) {
        this.logger.error(`Question item at index ${i} is not an object`);
        throw new InternalServerErrorException(
          'AI question item structure is invalid',
        );
      }

      const wordId: unknown = q['wordId'];
      const questionText: unknown = q['question'];
      const qType: unknown = q['type'];
      const optionsRaw: unknown = q['options'];
      const correctAnswer: unknown = q['correctAnswer'];

      if (typeof wordId !== 'string' || !validWordIds.has(wordId)) {
        this.logger.error(
          `Invalid or unrequested wordId at question index ${i}`,
        );
        throw new InternalServerErrorException(
          'AI returned an invalid word reference',
        );
      }

      if (
        typeof qType !== 'string' ||
        !allowedTypesSet.has(qType) ||
        !this.isValidQuizQuestionType(qType)
      ) {
        this.logger.error(`Invalid question type at question index ${i}`);
        throw new InternalServerErrorException(
          'AI returned an unsupported question type',
        );
      }

      if (
        typeof questionText !== 'string' ||
        questionText.trim().length === 0
      ) {
        this.logger.error(`Empty question text at question index ${i}`);
        throw new InternalServerErrorException(
          'AI returned empty question text',
        );
      }

      if (!Array.isArray(optionsRaw) || optionsRaw.length !== 4) {
        this.logger.error(
          `Options array length is not 4 at question index ${i}`,
        );
        throw new InternalServerErrorException(
          'AI generated invalid options count',
        );
      }

      const cleanedOptions: string[] = [];
      for (const opt of optionsRaw) {
        if (typeof opt !== 'string' || opt.trim().length === 0) {
          this.logger.error(`Option item in question ${i} is invalid`);
          throw new InternalServerErrorException(
            'AI generated invalid option text',
          );
        }
        cleanedOptions.push(opt.trim());
      }

      const uniqueOptions = new Set(cleanedOptions);
      if (uniqueOptions.size !== 4) {
        this.logger.error(`Duplicate options detected at question index ${i}`);
        throw new InternalServerErrorException(
          'AI generated duplicate options',
        );
      }

      if (
        typeof correctAnswer !== 'string' ||
        !cleanedOptions.includes(correctAnswer.trim())
      ) {
        this.logger.error(
          `Correct answer not found in options at question index ${i}`,
        );
        throw new InternalServerErrorException(
          'AI generated correct answer not in options',
        );
      }

      validatedQuestions.push({
        wordId,
        question: questionText.trim(),
        type: qType,
        options: cleanedOptions,
        correctAnswer: correctAnswer.trim(),
      });
    }

    return { questions: validatedQuestions };
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const itemI = shuffled[i];
      const itemJ = shuffled[j];
      if (itemI !== undefined && itemJ !== undefined) {
        shuffled[i] = itemJ;
        shuffled[j] = itemI;
      }
    }
    return shuffled;
  }

  private isRecord(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null;
  }

  private isValidQuizQuestionType(val: string): val is QuizQuestionType {
    return (Object.values(QuizQuestionType) as string[]).includes(val);
  }
}
