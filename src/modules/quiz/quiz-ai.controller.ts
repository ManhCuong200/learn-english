import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ModeratorGuard } from '@modules/auth/guards/moderator.guard';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { RegenerateQuestionDto } from './dto/regenerate-question.dto';
import {
  GenerateQuestionsResponse,
  RegenerateQuestionResponse,
  QuizAiService,
} from './quiz-ai.service';

@Controller('quizzes/ai')
@UseGuards(JwtAuthGuard, ModeratorGuard)
export class QuizAiController {
  constructor(private readonly quizAiService: QuizAiService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generateQuestions(
    @Body() dto: GenerateQuestionsDto,
  ): Promise<GenerateQuestionsResponse> {
    return this.quizAiService.generateQuestions(dto);
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  regenerateQuestion(
    @Body() dto: RegenerateQuestionDto,
  ): Promise<RegenerateQuestionResponse> {
    return this.quizAiService.regenerateQuestion(dto);
  }
}
