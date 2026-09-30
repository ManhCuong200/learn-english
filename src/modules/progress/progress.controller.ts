import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ProgressQueryDto } from './dto/progress-query.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('overview')
  getOverview(@Req() req: AuthenticatedRequest) {
    return this.progressService.getOverview(req.user.id);
  }

  @Get('activity')
  getActivity(
    @Req() req: AuthenticatedRequest,
    @Query() query: ProgressQueryDto,
  ) {
    const days = query.days ?? 7;
    return this.progressService.getActivity(req.user.id, days);
  }

  @Get('vocabulary')
  getVocabularyProgress(@Req() req: AuthenticatedRequest) {
    return this.progressService.getVocabularyProgress(req.user.id);
  }

  @Get('flashcards')
  getFlashcardsProgress(@Req() req: AuthenticatedRequest) {
    return this.progressService.getFlashcardsProgress(req.user.id);
  }

  @Get('quizzes')
  getQuizzesProgress(@Req() req: AuthenticatedRequest) {
    return this.progressService.getQuizzesProgress(req.user.id);
  }
}
