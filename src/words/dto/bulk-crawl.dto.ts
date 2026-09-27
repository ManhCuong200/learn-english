import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class BulkCrawlDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  words: string[];

  @IsString()
  categoryId: string;
}
