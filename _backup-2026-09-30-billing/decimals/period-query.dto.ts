import { IsDateString, IsOptional } from 'class-validator';

/** ?from=...&to=... (ISO 8601) -- periode affichee sur l'ecran Facturation & caisse. */
export class PeriodQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
