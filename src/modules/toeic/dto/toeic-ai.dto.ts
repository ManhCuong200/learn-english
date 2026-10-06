import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ToeicPart } from '@prisma/client';

export class GenerateToeicExamDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number = 2024;

  @IsOptional()
  @IsString()
  series?: string = 'ETS';

  @IsOptional()
  @IsString()
  difficulty?: string = 'INTERMEDIATE'; // BEGINNER, INTERMEDIATE, ADVANCED

  @IsOptional()
  @IsString()
  topic?: string =
    'Workplace Communication, Logistics, Finance, Travel, Technology';

  @IsOptional()
  @IsArray()
  @IsEnum(ToeicPart, { each: true })
  parts?: ToeicPart[]; // If not provided, generates all Part 1 - Part 7

  @IsOptional()
  @IsBoolean()
  saveToDatabase?: boolean = true;
}

export class GenerateToeicPartDto {
  @IsEnum(ToeicPart)
  part: ToeicPart;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number = 5;

  @IsOptional()
  @IsString()
  difficulty?: string = 'INTERMEDIATE';

  @IsOptional()
  @IsString()
  topic?: string = 'Office & Business Environment';

  @IsOptional()
  @IsString()
  examId?: string; // Optional: If provided, will automatically attach to this exam
}
