import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ExtractedWordDto {
  @IsString()
  @IsNotEmpty()
  word: string;

  @IsString()
  @IsNotEmpty()
  meaning: string;

  @IsString()
  @IsOptional()
  ipa?: string;

  @IsString()
  @IsOptional()
  level?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  exampleMeaning?: string;
}

export class ExtractedCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractedWordDto)
  words: ExtractedWordDto[];
}

export class ImportExtractedDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractedCategoryDto)
  categories: ExtractedCategoryDto[];
}
