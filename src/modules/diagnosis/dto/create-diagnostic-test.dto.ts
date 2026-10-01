import { IsString, MinLength } from 'class-validator';

export class CreateDiagnosticTestDto {
  @IsString()
  @MinLength(1)
  label!: string;
}
