import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

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
