import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '@core/prisma/prisma.module';
import { MailModule } from '@core/mail/mail.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CategoriesModule } from '@modules/categories/categories.module';
import { WordsModule } from '@modules/words/words.module';
import { LearningHistoryModule } from '@modules/learning-history/learning-history.module';
import { FlashcardModule } from '@modules/flashcard/flashcard.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { QuizModule } from '@modules/quiz/quiz.module';
import { ProgressModule } from '@modules/progress/progress.module';
import { ToeicModule } from '@modules/toeic/toeic.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    MailModule,
    AuthModule,
    CategoriesModule,
    WordsModule,
    LearningHistoryModule,
    FlashcardModule,
    DashboardModule,
    QuizModule,
    ProgressModule,
    ToeicModule,
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
export class AppModule {
  configure(consumer: import('@nestjs/common').MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes({ path: '*', method: import('@nestjs/common').RequestMethod.ALL });
  }
}

