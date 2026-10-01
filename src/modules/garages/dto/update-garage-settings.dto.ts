import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class OpeningDayDto {
  @IsBoolean()
  open!: boolean;

  @Matches(HHMM, { message: 'Heure invalide (HH:MM).' })
  from!: string;

  @Matches(HHMM, { message: 'Heure invalide (HH:MM).' })
  to!: string;
}

/** PATCH /garage-settings (ADMIN) : seuls les champs envoyes sont modifies. */
export class UpdateGarageSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string | null;

  /** 7 jours, lundi d'abord. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OpeningDayDto)
  openingHours?: OpeningDayDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  mechanicHoursPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  defaultAppointmentMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  planningSlotMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  invoiceDueDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  invoiceFooter?: string | null;

  @IsOptional()
  @IsBoolean()
  vatEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsBoolean()
  stampDutyEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000)
  stampDuty?: number;
}
