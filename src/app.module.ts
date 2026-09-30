import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { WordsModule } from './words/words.module';
import { MailModule } from './mail/mail.module';
import { ExamplesModule } from './examples/examples.module';
import { LearningHistoryModule } from './learning-history/learning-history.module';
import { FlashcardModule } from './flashcard/flashcard.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QuizModule } from './quiz/quiz.module';
import { ProgressModule } from './progress/progress.module';
import { QuizAiModule } from './quiz-ai/quiz-ai.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    WordsModule,
    MailModule,
    ExamplesModule,
    LearningHistoryModule,
    FlashcardModule,
    DashboardModule,
    QuizModule,
    ProgressModule,
    QuizAiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
