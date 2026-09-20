import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { WordsService } from './words.service';
import { CreateWordDto } from './dto/create-word.dto';
import { UpdateWordDto } from './dto/update-word.dto';

@Controller('words')
export class WordsController {
  constructor(private readonly wordsService: WordsService) {}

  @Post()
  create(@Body() dto: CreateWordDto) {
    return this.wordsService.create(dto);
  }

  @Get()
  findAll() {
    return this.wordsService.findAll();
  }

  @Get('search')
  search(@Query('q') query: string) {
    return this.wordsService.search(query ?? '');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wordsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWordDto,
  ) {
    return this.wordsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.wordsService.remove(id);
  }
}