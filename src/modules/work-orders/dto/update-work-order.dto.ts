import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Priority } from '../../../generated/prisma/client.js';

/**
 * "Contenu technique" du ticket (Section 20 : Edit technical WO content) --
 * statut et assignation ont chacun leur propre endpoint dedie (comme
 * GaragesController separe /approve, /reject... plutot qu'un PATCH generique
 * qui accepterait un champ status).
 */
export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  problemReported?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsIn(Object.values(Priority))
  priority?: Priority;

  /** Creneau planifie (ISO 8601) -- place le ticket sur le calendrier. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Duree estimee du creneau, en minutes (5 min -> 3 jours max). */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(4320)
  estimatedMinutes?: number;
}
