import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { FuelType, Transmission } from '../../../generated/prisma/client.js';

/**
 * Section 25/29 : contrairement a Customer, TOUS les roles garage-scoped
 * peuvent creer un Vehicle -- Admin, Front Desk, et Mecanicien (le
 * Mecanicien "n'est pas restreint aux vehicules assignes", il peut en
 * creer et travailler dessus, voir Section 19).
 *
 * customerId : le vehicule doit deja avoir un Customer -- pas de creation
 * "a la volee" d'un client depuis ce DTO, les deux ecrans restent separes.
 */
export class CreateVehicleDto {
  @IsString()
  customerId!: string;

  @IsString()
  @MinLength(1)
  make!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  year?: number;

  @IsString()
  @MinLength(1)
  plate!: string;

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
