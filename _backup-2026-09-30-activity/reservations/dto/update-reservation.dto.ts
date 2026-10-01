import { IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * customerId n'est PAS ici : fige a la creation (meme logique que
 * WorkOrder.customerId) -- une reservation ne change pas de client, on en
 * cree une nouvelle si besoin.
 */
export class UpdateReservationDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @IsOptional()
  @IsString()
  assignedMechanicId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
