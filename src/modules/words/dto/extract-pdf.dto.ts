import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExtractPdfDto {
  @IsString()
  @IsNotEmpty()
  base64: string;

  @IsString()
  @IsOptional()
  fileName?: string;
}
