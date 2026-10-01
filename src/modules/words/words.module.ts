import { Module } from '@nestjs/common';
import { WordsController } from './words.controller';
import { WordsService } from './words.service';
import { WordsAiService } from './words-ai.service';

@Module({
  controllers: [WordsController],
  providers: [WordsService, WordsAiService],
  exports: [WordsService, WordsAiService],
})
export class WordsModule {}
