import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { normalizePlate } from '../../../common/plate.js';
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

  // Normalise en "203 TU 5561" / "RS 123456" ; une saisie hors format reste
  // telle quelle et est rejetee par @Matches.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? (normalizePlate(value) ?? value) : value))
  @IsString()
  @Matches(/^(\d{1,3} TU \d{1,4}|RS \d{1,6})$/, {
    message: 'Immatriculation invalide. Format attendu : 203 TU 5561 ou RS 123456.',
  })
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
