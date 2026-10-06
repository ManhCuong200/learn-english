import { Body, Controller, Param, Post } from '@nestjs/common';
import { ToeicAiService } from './toeic-ai.service';
import { GenerateToeicExamDto, GenerateToeicPartDto } from './dto/toeic-ai.dto';

@Controller('toeic/ai')
export class ToeicAiController {
  constructor(private readonly aiService: ToeicAiService) {}

  /**
   * AI-generate a full or customized TOEIC exam and optionally save to DB
   */
  @Post('generate-exam')
  generateExam(@Body() dto: GenerateToeicExamDto) {
    return this.aiService.generateToeicExam(dto);
  }

  /**
   * AI-generate questions for a specific Part (Part 1 - 7)
   */
  @Post('generate-part')
  generatePart(@Body() dto: GenerateToeicPartDto) {
    return this.aiService.generatePartQuestions(dto);
  }

  /**
   * AI-generate questions for a specific Part and append directly into existing exam
   */
  @Post('exams/:examId/generate-part')
  generatePartForExam(
    @Param('examId') examId: string,
    @Body() dto: GenerateToeicPartDto,
  ) {
    return this.aiService.generatePartQuestions({
      ...dto,
      examId,
    });
  }
}
