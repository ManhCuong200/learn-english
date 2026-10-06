import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { ExamType, ToeicPart } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { GenerateToeicExamDto, GenerateToeicPartDto } from './dto/toeic-ai.dto';

export interface RawAiPassage {
  title?: string;
  content?: string;
  transcript?: string;
  translation?: string;
  audioUrl?: string;
  imageUrl?: string;
  questions: Array<{
    questionNumber: number;
    questionText?: string;
    imageUrl?: string;
    audioUrl?: string;
    options: Record<string, string>;
    correctAnswer: string;
    explanation?: string;
    transcript?: string;
  }>;
}

export interface RawAiSingleQuestion {
  questionNumber: number;
  questionText?: string;
  imageUrl?: string;
  audioUrl?: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation?: string;
  transcript?: string;
}

export interface ParsedAiResponse {
  passages?: RawAiPassage[];
  questions?: RawAiSingleQuestion[];
}

@Injectable()
export class ToeicAiService {
  private readonly logger = new Logger(ToeicAiService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getGenAiClient(): { ai: GoogleGenAI; model: string } {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key') {
      this.logger.error(
        'GEMINI_API_KEY is not configured in environment variables',
      );
      throw new InternalServerErrorException(
        'GEMINI_API_KEY is missing or invalid. Please check your .env configuration.',
      );
    }
    const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
    return { ai: new GoogleGenAI({ apiKey }), model };
  }

  /**
   * Automatically generate an entire TOEIC exam or selected parts using Gemini AI
   */
  async generateToeicExam(dto: GenerateToeicExamDto) {
    const partsToGenerate =
      dto.parts && dto.parts.length > 0
        ? dto.parts
        : [
            ToeicPart.PART_1,
            ToeicPart.PART_2,
            ToeicPart.PART_3,
            ToeicPart.PART_4,
            ToeicPart.PART_5,
            ToeicPart.PART_6,
            ToeicPart.PART_7,
          ];

    const year = dto.year || 2024;
    const series = dto.series || 'ETS';
    const timestamp = Date.now().toString().slice(-4);
    const slug = `ai-ets-${year}-${timestamp}`;
    const title =
      dto.title ||
      `ETS TOEIC ${year} (AI Generated) - ${dto.difficulty || 'Standard'}`;

    this.logger.log(`Starting AI generation for exam: ${title}`);

    // Generate questions for each requested part
    const generatedData: {
      part: ToeicPart;
      passages: RawAiPassage[];
      standaloneQuestions: RawAiSingleQuestion[];
    }[] = [];

    let currentQuestionNumber = 1;

    for (const part of partsToGenerate) {
      this.logger.log(`Generating questions for ${part}...`);
      const partResult = await this.generatePartContent(
        part,
        dto.difficulty || 'INTERMEDIATE',
        dto.topic || 'Business, Office, Logistics, Tourism, Technology',
        currentQuestionNumber,
      );

      generatedData.push({
        part,
        passages: partResult.passages,
        standaloneQuestions: partResult.standaloneQuestions,
      });

      // Update question number pointer
      const totalInPart =
        partResult.standaloneQuestions.length +
        partResult.passages.reduce((sum, p) => sum + p.questions.length, 0);
      currentQuestionNumber += totalInPart;

      // Small delay between calls to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!dto.saveToDatabase) {
      return {
        title,
        slug,
        year,
        series,
        difficulty: dto.difficulty || 'INTERMEDIATE',
        parts: generatedData,
      };
    }

    // Save to Database
    const totalQuestions = generatedData.reduce((acc, curr) => {
      const passageQuestions = curr.passages.reduce(
        (sum, p) => sum + p.questions.length,
        0,
      );
      return acc + passageQuestions + curr.standaloneQuestions.length;
    }, 0);

    const exam = await this.prisma.toeicExam.create({
      data: {
        title,
        slug,
        description: `Đề thi TOEIC được tạo tự động bởi Gemini AI theo chuẩn format ETS. Chủ đề: ${dto.topic}. Độ khó: ${dto.difficulty}.`,
        year,
        series,
        difficulty: dto.difficulty || 'INTERMEDIATE',
        type:
          partsToGenerate.length === 7
            ? ExamType.FULL_TEST
            : ExamType.PRACTICE_PART,
        duration: partsToGenerate.length === 7 ? 120 : 45,
        totalQuestions,
        audioFullUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp3',
        isPublished: true,
      },
    });

    let passageCounter = 1;

    for (const group of generatedData) {
      // 1. Save passages and their questions
      for (const p of group.passages) {
        const createdPassage = await this.prisma.toeicPassage.create({
          data: {
            examId: exam.id,
            part: group.part,
            passageNumber: passageCounter++,
            title: p.title,
            content: p.content,
            transcript: p.transcript,
            translation: p.translation,
            audioUrl:
              p.audioUrl ||
              'https://res.cloudinary.com/demo/video/upload/sample.mp3',
            imageUrl: p.imageUrl,
          },
        });

        if (p.questions && p.questions.length > 0) {
          await this.prisma.toeicQuestion.createMany({
            data: p.questions.map((q) => ({
              examId: exam.id,
              passageId: createdPassage.id,
              part: group.part,
              questionNumber: q.questionNumber,
              questionText: q.questionText,
              imageUrl: q.imageUrl,
              audioUrl: q.audioUrl,
              options: q.options,
              correctAnswer: q.correctAnswer.trim().toUpperCase(),
              explanation: q.explanation,
              transcript: q.transcript,
            })),
          });
        }
      }

      // 2. Save standalone questions (Part 1, 2, 5)
      if (group.standaloneQuestions.length > 0) {
        await this.prisma.toeicQuestion.createMany({
          data: group.standaloneQuestions.map((q) => ({
            examId: exam.id,
            part: group.part,
            questionNumber: q.questionNumber,
            questionText: q.questionText,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            options: q.options,
            correctAnswer: q.correctAnswer.trim().toUpperCase(),
            explanation: q.explanation,
            transcript: q.transcript,
          })),
        });
      }
    }

    this.logger.log(
      `Successfully created and saved AI TOEIC Exam (ID: ${exam.id})`,
    );

    return this.prisma.toeicExam.findUnique({
      where: { id: exam.id },
      include: {
        passages: {
          include: {
            questions: true,
          },
        },
        questions: true,
      },
    });
  }

  /**
   * Generate questions for a specific Part (Part 1 - 7)
   */
  async generatePartQuestions(dto: GenerateToeicPartDto) {
    const {
      part,
      count = 5,
      difficulty = 'INTERMEDIATE',
      topic = 'Business',
    } = dto;
    const startNumber = 101; // default start

    const result = await this.generatePartContent(
      part,
      difficulty,
      topic,
      startNumber,
      count,
    );

    // If examId is provided, attach directly into that exam
    if (dto.examId) {
      const exam = await this.prisma.toeicExam.findUnique({
        where: { id: dto.examId },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${dto.examId} not found`);
      }

      // Find max questionNumber currently in exam
      const lastQ = await this.prisma.toeicQuestion.findFirst({
        where: { examId: exam.id },
        orderBy: { questionNumber: 'desc' },
      });
      let nextNumber = (lastQ?.questionNumber || 0) + 1;

      // Save passages
      for (const p of result.passages) {
        const passage = await this.prisma.toeicPassage.create({
          data: {
            examId: exam.id,
            part,
            title: p.title,
            content: p.content,
            transcript: p.transcript,
            translation: p.translation,
            audioUrl:
              p.audioUrl ||
              'https://res.cloudinary.com/demo/video/upload/sample.mp3',
            imageUrl: p.imageUrl,
          },
        });

        for (const q of p.questions) {
          await this.prisma.toeicQuestion.create({
            data: {
              examId: exam.id,
              passageId: passage.id,
              part,
              questionNumber: nextNumber++,
              questionText: q.questionText,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              transcript: q.transcript,
            },
          });
        }
      }

      // Save standalone
      for (const q of result.standaloneQuestions) {
        await this.prisma.toeicQuestion.create({
          data: {
            examId: exam.id,
            part,
            questionNumber: nextNumber++,
            questionText: q.questionText,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            transcript: q.transcript,
          },
        });
      }

      // Update total questions on exam
      await this.prisma.toeicExam.update({
        where: { id: exam.id },
        data: {
          totalQuestions: {
            increment:
              result.standaloneQuestions.length +
              result.passages.reduce((sum, p) => sum + p.questions.length, 0),
          },
        },
      });

      return {
        message: `Successfully generated and added questions to exam ${exam.title}`,
        part,
        result,
      };
    }

    return {
      part,
      difficulty,
      topic,
      result,
    };
  }

  /**
   * Internal generator helper for specific parts using Gemini structured outputs
   */
  private async generatePartContent(
    part: ToeicPart,
    difficulty: string,
    topic: string,
    startQuestionNumber: number,
    desiredCount = 5,
  ): Promise<{
    passages: RawAiPassage[];
    standaloneQuestions: RawAiSingleQuestion[];
  }> {
    const { ai } = this.getGenAiClient();

    const systemInstruction = `You are a certified ETS TOEIC test author. Generate authentic, high-quality TOEIC practice questions adhering strictly to official ETS guidelines.
Language of explanations and translations must be in Vietnamese.
Ensure exactly one option is correct. All options must be realistic plausible distractors.`;

    let prompt = '';
    let responseSchema: any;

    if (part === ToeicPart.PART_1) {
      // Photographs
      prompt = `Generate ${Math.min(desiredCount, 4)} TOEIC Part 1 (Photographs) questions.
Topic: ${topic}. Difficulty: ${difficulty}.
For each question:
- Describe the visual scene in detail.
- Provide 4 statements (A, B, C, D) describing the scene.
- One statement is clearly correct, three are plausible incorrect distractors.
- Provide Vietnamese detailed explanation and English transcript.
- Starting question number: ${startQuestionNumber}.`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionNumber: { type: Type.INTEGER },
                questionText: { type: Type.STRING },
                imageUrl: { type: Type.STRING },
                options: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING },
                  },
                  required: ['A', 'B', 'C', 'D'],
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                transcript: { type: Type.STRING },
              },
              required: [
                'questionNumber',
                'questionText',
                'options',
                'correctAnswer',
                'explanation',
                'transcript',
              ],
            },
          },
        },
        required: ['questions'],
      };
    } else if (part === ToeicPart.PART_2) {
      // Question-Response (Only 3 options: A, B, C)
      prompt = `Generate ${Math.min(desiredCount, 6)} TOEIC Part 2 (Question-Response) questions.
Topic: ${topic}. Difficulty: ${difficulty}.
Each item has:
- A spoken question/statement (Wh-question, Yes/No, Request, or Statement).
- 3 response options (A, B, C).
- Exactly 1 correct response.
- Transcript and detailed Vietnamese explanation.
- Starting question number: ${startQuestionNumber}.`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionNumber: { type: Type.INTEGER },
                questionText: { type: Type.STRING },
                options: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                  },
                  required: ['A', 'B', 'C'],
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                transcript: { type: Type.STRING },
              },
              required: [
                'questionNumber',
                'questionText',
                'options',
                'correctAnswer',
                'explanation',
                'transcript',
              ],
            },
          },
        },
        required: ['questions'],
      };
    } else if (part === ToeicPart.PART_3 || part === ToeicPart.PART_4) {
      // Conversations / Talks (Group with Passage)
      const isPart3 = part === ToeicPart.PART_3;
      prompt = `Generate 1 authentic TOEIC ${isPart3 ? 'Part 3 (Short Conversation)' : 'Part 4 (Short Talk)'} unit.
Topic: ${topic}. Difficulty: ${difficulty}.
Include:
- Passage Title (e.g., "Questions ${startQuestionNumber}-${startQuestionNumber + 2} refer to the following ${isPart3 ? 'conversation' : 'announcement'}")
- Spoken Audio Transcript (${isPart3 ? 'dialogue between Man and Woman' : 'continuous short talk'})
- Full Vietnamese translation of the script
- Exactly 3 multiple-choice comprehension questions (Questions ${startQuestionNumber}, ${startQuestionNumber + 1}, ${startQuestionNumber + 2})
- Each question has 4 options (A, B, C, D) and a detailed Vietnamese explanation.`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          passages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                transcript: { type: Type.STRING },
                translation: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: { type: Type.INTEGER },
                      questionText: { type: Type.STRING },
                      options: {
                        type: Type.OBJECT,
                        properties: {
                          A: { type: Type.STRING },
                          B: { type: Type.STRING },
                          C: { type: Type.STRING },
                          D: { type: Type.STRING },
                        },
                        required: ['A', 'B', 'C', 'D'],
                      },
                      correctAnswer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: [
                      'questionNumber',
                      'questionText',
                      'options',
                      'correctAnswer',
                      'explanation',
                    ],
                  },
                },
              },
              required: ['title', 'transcript', 'translation', 'questions'],
            },
          },
        },
        required: ['passages'],
      };
    } else if (part === ToeicPart.PART_5) {
      // Incomplete Sentences
      prompt = `Generate ${Math.min(desiredCount, 10)} TOEIC Part 5 (Incomplete Sentences) questions.
Topic: ${topic}. Difficulty: ${difficulty}.
Include a mix of:
- Part of speech / word form (noun, verb, adjective, adverb)
- Verb tense and voice (passive / active)
- Prepositions, conjunctions, relative pronouns
- Advanced business vocabulary
Each question has:
- A sentence with one blank _______
- 4 options (A, B, C, D)
- Exactly 1 correct answer
- Thorough Vietnamese explanation breaking down the grammatical rule or vocabulary meaning
- Starting question number: ${startQuestionNumber}.`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionNumber: { type: Type.INTEGER },
                questionText: { type: Type.STRING },
                options: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING },
                  },
                  required: ['A', 'B', 'C', 'D'],
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: [
                'questionNumber',
                'questionText',
                'options',
                'correctAnswer',
                'explanation',
              ],
            },
          },
        },
        required: ['questions'],
      };
    } else if (part === ToeicPart.PART_6) {
      // Text Completion
      prompt = `Generate 1 authentic TOEIC Part 6 (Text Completion) reading text.
Topic: ${topic}. Difficulty: ${difficulty}.
Include:
- Passage Title (e.g., "Questions ${startQuestionNumber}-${startQuestionNumber + 3} refer to the following email/notice")
- Passage Content with 4 numbered blanks: [${startQuestionNumber}], [${startQuestionNumber + 1}], [${startQuestionNumber + 2}], [${startQuestionNumber + 3}].
- Vietnamese translation of the text.
- 4 questions corresponding to the 4 blanks:
  - 3 vocabulary/grammar blanks
  - 1 sentence-insertion blank (where options A, B, C, D are complete sentences)
- Each question has 4 options (A, B, C, D), correct answer, and detailed Vietnamese explanation.`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          passages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                translation: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: { type: Type.INTEGER },
                      questionText: { type: Type.STRING },
                      options: {
                        type: Type.OBJECT,
                        properties: {
                          A: { type: Type.STRING },
                          B: { type: Type.STRING },
                          C: { type: Type.STRING },
                          D: { type: Type.STRING },
                        },
                        required: ['A', 'B', 'C', 'D'],
                      },
                      correctAnswer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: [
                      'questionNumber',
                      'questionText',
                      'options',
                      'correctAnswer',
                      'explanation',
                    ],
                  },
                },
              },
              required: ['title', 'content', 'translation', 'questions'],
            },
          },
        },
        required: ['passages'],
      };
    } else {
      // Part 7: Reading Comprehension
      prompt = `Generate 1 authentic TOEIC Part 7 (Reading Comprehension) passage set.
Topic: ${topic}. Difficulty: ${difficulty}.
Include:
- Passage Title (e.g. "Questions ${startQuestionNumber}-${startQuestionNumber + 3} refer to the following press release/memorandum")
- Rich passage content (business email, corporate memo, press release, or schedule)
- Complete Vietnamese translation
- 3 to 4 comprehension questions (Main idea, Detail, Inference/NOT question, Synonym/Vocabulary in context)
- Each question has 4 options (A, B, C, D) and detailed Vietnamese explanation citing evidence from the text.`;

      responseSchema = {
        type: Type.OBJECT,
        properties: {
          passages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                translation: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionNumber: { type: Type.INTEGER },
                      questionText: { type: Type.STRING },
                      options: {
                        type: Type.OBJECT,
                        properties: {
                          A: { type: Type.STRING },
                          B: { type: Type.STRING },
                          C: { type: Type.STRING },
                          D: { type: Type.STRING },
                        },
                        required: ['A', 'B', 'C', 'D'],
                      },
                      correctAnswer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: [
                      'questionNumber',
                      'questionText',
                      'options',
                      'correctAnswer',
                      'explanation',
                    ],
                  },
                },
              },
              required: ['title', 'content', 'translation', 'questions'],
            },
          },
        },
        required: ['passages'],
      };
    }

    const candidateModels = Array.from(
      new Set([
        process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-flash-latest',
        'gemini-3.5-flash',
      ]),
    );

    let lastError: unknown = null;

    for (const currentModel of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
          },
        });

        const responseText = response.text;
        if (!responseText) {
          continue;
        }

        const parsed = JSON.parse(responseText) as ParsedAiResponse;

        if (parsed.passages && parsed.passages.length > 0) {
          return {
            passages: parsed.passages,
            standaloneQuestions: [],
          };
        }

        if (parsed.questions && parsed.questions.length > 0) {
          // If Part 1, attach demo image if empty
          if (part === ToeicPart.PART_1) {
            parsed.questions.forEach((q) => {
              if (!q.imageUrl) {
                q.imageUrl =
                  'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80';
              }
            });
          }
          return {
            passages: [],
            standaloneQuestions: parsed.questions,
          };
        }

        return { passages: [], standaloneQuestions: [] };
      } catch (error: unknown) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Model ${currentModel} failed for ${part} (${msg}). Trying next candidate model...`,
        );
        // Wait 1 second before trying next candidate model
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const finalMsg =
      lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(`All candidate models failed for ${part}: ${finalMsg}`);
    throw new InternalServerErrorException(
      `Failed to generate TOEIC questions via AI for ${part}: ${finalMsg}`,
    );
  }
}
