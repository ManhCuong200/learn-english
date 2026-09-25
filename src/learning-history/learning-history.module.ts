import { Module } from '@nestjs/common';
import { LearningHistoryController } from './learning-history.controller';
import { LearningHistoryService } from './learning-history.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LearningHistoryController],
  providers: [LearningHistoryService]
})
export class LearningHistoryModule {}
