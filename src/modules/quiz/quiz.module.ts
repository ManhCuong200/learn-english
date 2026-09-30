import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizAiController } from './quiz-ai.controller';
import { QuizAiService } from './quiz-ai.service';
import { PrismaModule } from '@core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [QuizController, QuizAiController],
  providers: [QuizService, QuizAiService],
  exports: [QuizService, QuizAiService],
})
export class QuizModule {}
