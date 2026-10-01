import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Priority, TaskStatus } from '../../../generated/prisma/client.js';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsIn(Object.values(TaskStatus))
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assignedMechanicId?: string;

  @IsOptional()
  @IsIn(Object.values(Priority))
  priority?: Priority;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualMinutes?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
