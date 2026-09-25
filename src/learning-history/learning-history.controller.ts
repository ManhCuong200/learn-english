import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LearningHistoryService } from './learning-history.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningActivityType } from '@prisma/client';

@Controller('learning-history')
@UseGuards(JwtAuthGuard)
export class LearningHistoryController {
  constructor(
    private readonly learningHistoryService: LearningHistoryService,
  ) {}

  @Get()
  getHistory(
    @Request() req,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('type') type?: LearningActivityType,
  ) {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 20;

    return this.learningHistoryService.getHistory(
      req.user.id,
      page,
      limit,
      type,
    );
  }

  @Post()
  createHistory(
    @Request() req,
    @Body()
    body: {
      type: LearningActivityType;
      title: string;
      description: string;
      referenceId?: string;
    },
  ) {
    return this.learningHistoryService.createHistory(req.user.id, body);
  }
}
