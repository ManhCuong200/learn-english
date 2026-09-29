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
import { WordsService } from './words.service';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { BulkCrawlDto } from './dto/bulk-crawl.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/interfaces/authenticated-request.interface';

interface OptionalUserRequest {
  user?: {
    id: string;
  };
}

@Controller('words')
export class WordsController {
  constructor(private readonly wordsService: WordsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() dto: CreateWordDto) {
    return this.wordsService.create(dto);
  }

  @Post('bulk-crawl')
  @UseGuards(JwtAuthGuard, AdminGuard)
  bulkCrawl(@Body() dto: BulkCrawlDto) {
    return this.wordsService.bulkCrawl(dto);
  }

  @Get('fetch-info')
  fetchInfo(@Query('word') word: string) {
    return this.wordsService.fetchWordInfo(word ?? '');
  }

  @Get()
  findAll(@Req() req: OptionalUserRequest) {
    const userId = req.user?.id;
    return this.wordsService.findAll(userId);
  }

  @Get('search')
  search(@Query('q') query: string) {
    return this.wordsService.search(query ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: OptionalUserRequest) {
    const userId = req.user?.id;
    return this.wordsService.findOne(id, userId);
  }

  @Post(':id/learn')
  @UseGuards(JwtAuthGuard)
  markAsLearned(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.wordsService.markAsLearned(req.user.id, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateWordDto) {
    return this.wordsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id') id: string) {
    return this.wordsService.remove(id);
  }
}
