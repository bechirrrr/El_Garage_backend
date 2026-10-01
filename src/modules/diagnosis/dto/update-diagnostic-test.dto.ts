import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDiagnosticTestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  performed?: boolean;
}
