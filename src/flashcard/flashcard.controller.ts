import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FlashcardService } from './flashcard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReviewFlashcardDto } from './dto/review-flashcard.dto';

@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardController {
  constructor(private readonly flashcardService: FlashcardService) {}

  @Get()
  async getFlashcards(
    @Request() req,
    @Query('limit') limitStr?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    let limit = 10;
    if (limitStr) {
      limit = parseInt(limitStr, 10);
      if (isNaN(limit) || limit < 1 || limit > 50) {
        throw new BadRequestException('Limit must be between 1 and 50');
      }
    }

    return this.flashcardService.getFlashcards(req.user.id, limit, categoryId);
  }

  @Get(':wordId')
  async getFlashcard(@Request() req, @Param('wordId') wordId: string) {
    return this.flashcardService.getFlashcard(req.user.id, wordId);
  }

  @Post(':wordId/review')
  async reviewFlashcard(
    @Request() req,
    @Param('wordId') wordId: string,
    @Body() dto: ReviewFlashcardDto,
  ) {
    return this.flashcardService.reviewFlashcard(req.user.id, wordId, dto);
  }
}
