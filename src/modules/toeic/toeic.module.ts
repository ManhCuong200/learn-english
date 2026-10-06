import { Module } from '@nestjs/common';
import { ToeicController } from './toeic.controller';
import { ToeicAiController } from './toeic-ai.controller';
import { ToeicService } from './toeic.service';
import { ToeicScalerService } from './toeic-scaler.service';
import { ToeicAiService } from './toeic-ai.service';
import { PrismaModule } from '@core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ToeicController, ToeicAiController],
  providers: [ToeicService, ToeicScalerService, ToeicAiService],
  exports: [ToeicService, ToeicScalerService, ToeicAiService],
})
export class ToeicModule {}
