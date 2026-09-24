import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  word: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  meaning: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pronunciation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string;

  @IsString()
  categoryId: string;
}
