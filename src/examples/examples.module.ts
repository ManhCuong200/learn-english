import { Module } from '@nestjs/common';
import { ExamplesService } from './examples.service';
import { ExamplesController } from './examples.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExamplesController],
  providers: [ExamplesService],
})
export class ExamplesModule {}
