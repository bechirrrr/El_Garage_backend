import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { normalizePlate } from '../../../common/plate.js';

/** Nouveau client (si customerId n'est pas fourni). Reutilise si le telephone existe deja. */
export class DirectInvoiceCustomerDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Nouveau vehicule (si vehicleId n'est pas fourni). Reutilise si la plaque existe deja pour ce client. */
export class DirectInvoiceVehicleDto {
  @IsString()
  @MinLength(1)
  make!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? (normalizePlate(value) ?? value) : value))
  @IsString()
  @Matches(/^(\d{1,3} TU \d{1,4}|RS \d{1,6})$/, {
    message: 'Immatriculation invalide. Format attendu : 203 TU 5561 ou RS 123456.',
  })
  plate!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  year?: number;
}

/** Ligne de piece : du stock (stockItemId) ou hors stock (name + unitPrice). */
export class DirectInvoicePartDto {
  @IsOptional()
  @IsUUID()
  stockItemId?: string;

  @ValidateIf((o: DirectInvoicePartDto) => !o.stockItemId || o.name !== undefined)
  @IsString()
  @MinLength(1)
  name?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @ValidateIf((o: DirectInvoicePartDto) => !o.stockItemId || o.unitPrice !== undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitPrice?: number;
}

/**
 * POST /invoices -- facture directe depuis Facturation, sans passer par tout
 * le flux atelier. Client et vehicule : existants (ids) OU saisis (crees si
 * besoin). Un OR "Terminé" est cree en coulisse pour porter la facture
 * (relation Invoice 1-1 WorkOrder).
 */
export class CreateDirectInvoiceDto {
  @ValidateIf((o: CreateDirectInvoiceDto) => !o.customer)
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DirectInvoiceCustomerDto)
  customer?: DirectInvoiceCustomerDto;

  @ValidateIf((o: CreateDirectInvoiceDto) => !o.vehicle)
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DirectInvoiceVehicleDto)
  vehicle?: DirectInvoiceVehicleDto;

  /** Travaux realises (devient le "probleme signale" de l'OR). */
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  laborPrice?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DirectInvoicePartDto)
  parts?: DirectInvoicePartDto[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** true (defaut) : facture emise -> "Non payée", a encaisser. false : brouillon. */
  @IsOptional()
  @IsBoolean()
  issue?: boolean;
}
