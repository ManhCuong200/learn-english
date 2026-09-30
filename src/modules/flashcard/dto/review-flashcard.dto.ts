import { IsEnum } from 'class-validator';
import { FlashcardReviewResultType } from '@prisma/client';

export class ReviewFlashcardDto {
  @IsEnum(FlashcardReviewResultType)
  result: FlashcardReviewResultType;
}
