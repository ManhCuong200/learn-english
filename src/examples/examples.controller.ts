import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ExamplesService } from './examples.service';
import { CreateExampleDto } from './dto/create-example.dto';
import { UpdateExampleDto } from './dto/update-example.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
export class ExamplesController {
  constructor(private readonly examplesService: ExamplesService) {}

  @Post('words/:wordId/examples')
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(
    @Param('wordId') wordId: string,
    @Body() createExampleDto: CreateExampleDto,
  ) {
    return this.examplesService.create(wordId, createExampleDto);
  }

  @Get('words/:wordId/examples')
  findAllByWord(@Param('wordId') wordId: string) {
    return this.examplesService.findAllByWord(wordId);
  }

  @Patch('examples/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() updateExampleDto: UpdateExampleDto) {
    return this.examplesService.update(id, updateExampleDto);
  }

  @Delete('examples/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id') id: string) {
    return this.examplesService.remove(id);
  }
}
