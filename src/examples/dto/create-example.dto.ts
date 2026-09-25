import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  meaning?: string;
}
