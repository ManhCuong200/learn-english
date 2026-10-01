import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { QuizQuestionType } from '@prisma/client';

export class GenerateQuestionsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxLength(20)
  level?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  count: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsEnum(QuizQuestionType, { each: true })
  types: QuizQuestionType[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  wordIds?: string[];
}
