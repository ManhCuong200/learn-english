import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserAnswerItemDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsOptional()
  @IsString()
  selectedAnswer?: string | null;
}

export class SubmitExamDto {
  @Type(() => Number)
  @IsInt()
  timeSpent: number; // Duration spent in seconds

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserAnswerItemDto)
  answers: UserAnswerItemDto[];
}
