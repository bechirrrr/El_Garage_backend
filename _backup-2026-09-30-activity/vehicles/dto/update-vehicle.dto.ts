import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { FuelType, Transmission } from '../../../generated/prisma/client.js';

/**
 * Pas de customerId ici : reassigner un vehicule a un autre client est un
 * cas rare et sensible (historique de reparations lie au mauvais client),
 * volontairement hors scope de ce DTO pour l'instant. Si le besoin se
 * confirme, ce sera une action dediee et tracee plutot qu'un simple champ
 * d'update.
 */
export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  make?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  plate?: string;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsIn(Object.values(FuelType))
  fuelType?: FuelType;

  @IsOptional()
  @IsString()
  engineSize?: string;

  @IsOptional()
  @IsIn(Object.values(Transmission))
  transmission?: Transmission;
}
