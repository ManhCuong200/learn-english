import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ToeicService } from './toeic.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ModeratorGuard } from '@modules/auth/guards/moderator.guard';
import { GetExamsQueryDto, StartExamDto } from './dto/get-exams-query.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';
import {
  CreateExamDto,
  CreatePassageDto,
  CreateQuestionDto,
} from './dto/moderator-toeic.dto';
import { ToeicPart } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
  };
}

@Controller('toeic')
export class ToeicController {
  constructor(private readonly toeicService: ToeicService) {}

  // ----------------------------------------------------
  // PUBLIC / LEARNER ENDPOINTS (Browsing exams & questions)
  // ----------------------------------------------------

  @Get('exams')
  getExams(@Query() query: GetExamsQueryDto) {
    return this.toeicService.getExams(query);
  }

  @Get('exams/:idOrSlug')
  getExamDetail(@Param('idOrSlug') idOrSlug: string) {
    return this.toeicService.getExamDetail(idOrSlug);
  }

  @Get('exams/:idOrSlug/questions')
  getExamQuestions(
    @Param('idOrSlug') idOrSlug: string,
    @Query('targetPart') targetPart?: ToeicPart,
  ) {
    return this.toeicService.getExamQuestions(idOrSlug, targetPart);
  }

  // ----------------------------------------------------
  // AUTHENTICATED LEARNER ENDPOINTS (Attempts & History)
  // ----------------------------------------------------

  @Post('exams/:id/start')
  @UseGuards(JwtAuthGuard)
  startExam(
    @Req() req: AuthenticatedRequest,
    @Param('id') examId: string,
    @Body() dto: StartExamDto,
  ) {
    return this.toeicService.startExamAttempt(
      req.user.id,
      examId,
      dto.targetPart,
    );
  }

  @Post('attempts/:attemptId/submit')
  @UseGuards(JwtAuthGuard)
  submitExam(
    @Req() req: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitExamDto,
  ) {
    return this.toeicService.submitExamAttempt(req.user.id, attemptId, dto);
  }

  @Get('attempts/:attemptId')
  @UseGuards(JwtAuthGuard)
  getAttemptDetail(
    @Req() req: AuthenticatedRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.toeicService.getAttemptDetail(req.user.id, attemptId);
  }

  @Get('user/history')
  @UseGuards(JwtAuthGuard)
  getUserAttempts(@Req() req: AuthenticatedRequest) {
    return this.toeicService.getUserAttempts(req.user.id);
  }

  // ----------------------------------------------------
  // MODERATOR ENDPOINTS
  // ----------------------------------------------------

  @Post('moderator/exams')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  createExam(@Body() dto: CreateExamDto) {
    return this.toeicService.createExam(dto);
  }

  @Post('moderator/exams/:id/passages')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  createPassage(@Param('id') examId: string, @Body() dto: CreatePassageDto) {
    return this.toeicService.createPassage(examId, dto);
  }

  @Post('moderator/exams/:id/questions')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  createQuestion(@Param('id') examId: string, @Body() dto: CreateQuestionDto) {
    return this.toeicService.createQuestion(examId, dto);
  }

  @Delete('moderator/exams/:id')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  deleteExam(@Param('id') id: string) {
    return this.toeicService.deleteExam(id);
  }
}
