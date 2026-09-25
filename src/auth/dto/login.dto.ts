import { IsEmail, IsString, MaxLength, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @IsOptional()
  twoFactorCode?: string;
}
