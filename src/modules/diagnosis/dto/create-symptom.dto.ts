import { IsString, MinLength } from 'class-validator';

export class CreateSymptomDto {
  @IsString()
  @MinLength(1)
  label!: string;
}
