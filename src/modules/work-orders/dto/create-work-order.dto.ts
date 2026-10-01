import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Priority } from '../../../generated/prisma/client.js';

/**
 * Section 10/25 : ouvrir un ticket, c'est rattacher un Vehicle a un premier
 * probleme rapporte. customerId n'est PAS ici : il est derive cote service
 * a partir de vehicle.customerId (voir le commentaire dans work-order.prisma
 * sur le "gel" du proprietaire au moment de la reparation).
 *
 * Pas d'assignedMechanicId non plus : "Assign / reassign a Work Order to a
 * Mechanic" est une permission a part entiere (Section 29), avec ses
 * propres regles (Admin/Front Desk seulement) -- c'est le role de
 * PATCH /work-orders/:id/assign, pas de la creation.
 */
export class CreateWorkOrderDto {
  @IsString()
  vehicleId!: string;

  @IsString()
  @MinLength(2)
  problemReported!: string;

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
