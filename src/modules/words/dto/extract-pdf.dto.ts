import { IsOptional, IsString } from 'class-validator';

export class ExtractPdfDto {
  @IsString()
  @IsOptional()
  base64?: string;

  @IsString()
  @IsOptional()
  fileName?: string;
}
