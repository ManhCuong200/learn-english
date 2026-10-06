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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WordsService } from './words.service';
import { WordsAiService } from './words-ai.service';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';
import { BulkCrawlDto } from './dto/bulk-crawl.dto';
import { ExtractPdfDto } from './dto/extract-pdf.dto';
import { ImportExtractedDto } from './dto/import-extracted.dto';
import { ModeratorGuard } from '@modules/auth/guards/moderator.guard';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '@modules/auth/interfaces/authenticated-request.interface';

interface OptionalUserRequest {
  user?: {
    id: string;
  };
}

export interface UploadedMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('words')
export class WordsController {
  constructor(
    private readonly wordsService: WordsService,
    private readonly wordsAiService: WordsAiService,
  ) {}

  @Post('ai/extract-pdf')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  extractPdf(
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body() dto: ExtractPdfDto,
  ) {
    if (file) {
      return this.wordsAiService.extractFromPdf({
        base64: file.buffer.toString('base64'),
        fileName: file.originalname,
      });
    }
    return this.wordsAiService.extractFromPdf(dto);
  }

  @Post('ai/import-extracted')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  importExtracted(@Body() dto: ImportExtractedDto) {
    return this.wordsAiService.importExtracted(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  create(@Body() dto: CreateWordDto) {
    return this.wordsService.create(dto);
  }

  @Post('bulk-crawl')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
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
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  update(@Param('id') id: string, @Body() dto: UpdateWordDto) {
    return this.wordsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  remove(@Param('id') id: string) {
    return this.wordsService.remove(id);
  }
}
