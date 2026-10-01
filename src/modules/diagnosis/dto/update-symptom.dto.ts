import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSymptomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  checked?: boolean;
}
