import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExamType, ToeicPart } from '@prisma/client';

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  series?: string = 'ETS';

  @Type(() => Number)
  @IsInt()
  year: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  testNumber?: number = 1;

  @IsOptional()
  @IsEnum(ExamType)
  type?: ExamType = ExamType.FULL_TEST;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  duration?: number = 120;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  totalQuestions?: number = 200;

  @IsOptional()
  @IsString()
  audioFullUrl?: string;

  @IsOptional()
  @IsString()
  difficulty?: string = 'INTERMEDIATE';

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean = true;
}

export class CreatePassageDto {
  @IsEnum(ToeicPart)
  part: ToeicPart;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  passageNumber?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  translation?: string;
}

export class CreateQuestionDto {
  @IsOptional()
  @IsString()
  passageId?: string;

  @IsEnum(ToeicPart)
  part: ToeicPart;

  @Type(() => Number)
  @IsInt()
  questionNumber: number;

  @IsOptional()
  @IsString()
  questionText?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsNotEmpty()
  options: Record<string, string>;

  @IsString()
  @IsNotEmpty()
  correctAnswer: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  transcript?: string;
}
