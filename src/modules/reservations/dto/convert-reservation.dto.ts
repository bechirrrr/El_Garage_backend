import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Section 33, flow "reservation -> ticket" : vehicleId n'est requis ici
 * QUE si la Reservation n'en a pas deja un -- verifie cote service (depend
 * de l'etat de la Reservation, pas juste de la forme du body), pas
 * `!` sur le champ.
 */
export class ConvertReservationDto {
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;
}
