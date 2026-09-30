import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { QuizQuestionType } from '@prisma/client';

export class CreateQuizQuestionDto {
  @IsUUID()
  wordId: string;

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2)
  @MaxLength(1000)
  question: string;

  @IsEnum(QuizQuestionType)
  type: QuizQuestionType;

  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }): unknown =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : String(item).trim(),
        )
      : value,
  )
  options: string[];

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  correctAnswer: string;
}
