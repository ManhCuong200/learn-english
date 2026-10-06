import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ModeratorGuard } from '@modules/auth/guards/moderator.guard';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { ModeratorQuizQueryDto } from './dto/moderator-quiz-query.dto';
import { CreateQuizQuestionDto } from './dto/create-quiz-question.dto';
import { UpdateQuizQuestionDto } from './dto/update-quiz-question.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
  };
}

@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // ----------------------------------------------------
  // MODERATOR ENDPOINTS
  // ----------------------------------------------------

  @Post()
  @UseGuards(ModeratorGuard)
  createQuiz(@Body() dto: CreateQuizDto) {
    return this.quizService.createQuiz(dto);
  }

  @Get('moderator')
  @UseGuards(ModeratorGuard)
  getModeratorQuizzes(@Query() query: ModeratorQuizQueryDto) {
    return this.quizService.getModeratorQuizzes(query);
  }

  @Patch('questions/:questionId')
  @UseGuards(ModeratorGuard)
  updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuizQuestionDto,
  ) {
    return this.quizService.updateQuestion(questionId, dto);
  }

  @Delete('questions/:questionId')
  @UseGuards(ModeratorGuard)
  deleteQuestion(@Param('questionId') questionId: string) {
    return this.quizService.deleteQuestion(questionId);
  }

  @Patch(':id')
  @UseGuards(ModeratorGuard)
  updateQuiz(@Param('id') id: string, @Body() dto: UpdateQuizDto) {
    return this.quizService.updateQuiz(id, dto);
  }

  @Delete(':id')
  @UseGuards(ModeratorGuard)
  deleteQuiz(@Param('id') id: string) {
    return this.quizService.deleteQuiz(id);
  }

  @Post(':quizId/questions')
  @UseGuards(ModeratorGuard)
  createQuestion(
    @Param('quizId') quizId: string,
    @Body() dto: CreateQuizQuestionDto,
  ) {
    return this.quizService.createQuestion(quizId, dto);
  }

  // ----------------------------------------------------
  // LEARNER ENDPOINTS (UNTOUCHED & PRESERVED)
  // ----------------------------------------------------

  @Get('attempts/:attemptId')
  getAttempt(
    @Req() req: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.quizService.getAttempt(req.user.id, attemptId);
  }

  @Post('attempts/:attemptId/submit')
  submitQuiz(
    @Req() req: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
    @Body() submitDto: SubmitQuizDto,
  ) {
    return this.quizService.submitQuiz(req.user.id, attemptId, submitDto);
  }

  @Post(':id/start')
  startQuiz(@Req() req: AuthenticatedRequest, @Param('id') quizId: string) {
    return this.quizService.startQuiz(req.user.id, quizId);
  }

  @Get(':id')
  getQuiz(@Param('id') id: string) {
    return this.quizService.getQuiz(id);
  }

  @Get()
  getQuizzes(
    @Query('categoryId') categoryId?: string,
    @Query('level') level?: string,
  ) {
    return this.quizService.getQuizzes(categoryId, level);
  }
}
