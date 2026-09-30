import { Module } from '@nestjs/common';
import { QuizAiController } from './quiz-ai.controller';
import { QuizAiService } from './quiz-ai.service';

@Module({
  controllers: [QuizAiController],
  providers: [QuizAiService],
  exports: [QuizAiService],
})
export class QuizAiModule {}
