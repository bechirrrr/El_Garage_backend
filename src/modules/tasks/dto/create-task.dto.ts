import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Priority } from '../../../generated/prisma/client.js';

/**
 * Section 12 : une Task nait TODO par defaut (voir @default(TODO) sur le
 * schema) -- pas de champ status ici, seul update() peut le faire avancer.
 * assignedMechanicId est optionnel : Admin/Front Desk dispatchent souvent
 * les taches apres coup, une fois la liste posee.
 */
export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  label!: string;

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
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
