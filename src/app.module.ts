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

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    WordsModule,
    MailModule,
    ExamplesModule,
    LearningHistoryModule,
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
