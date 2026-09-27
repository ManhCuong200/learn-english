import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { QuizService, QuizAnswerItem } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('quiz')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('questions')
  getQuestions(@Req() req: any, @Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return this.quizService.getQuizQuestions(req.user.id, limitNum);
  }

  @Post('submit')
  submitQuiz(@Req() req: any, @Body('answers') answers: QuizAnswerItem[]) {
    return this.quizService.submitQuiz(req.user.id, answers);
  }
}
