import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AUDIT_KIND_NAMES, type AuditKind } from '../audit-kinds.js';

/** GET /audit : filtres du Journal d'audit. */
export class AuditQueryDto {
  /** Debut de periode (inclus), ISO 8601. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fin de periode (exclue), ISO 8601. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(AUDIT_KIND_NAMES)
  kind?: AuditKind;

  /** Un membre precis (ignore pour l'Accueil : il ne voit que ses actions). */
  @IsOptional()
  @IsUUID()
  actorId?: string;

  /** Seulement les prix modifies apres paiement. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  alertsOnly?: boolean;

  /** N° d'OR ("1431" ou "OR-1431"), plaque ou nom du client. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  /** Pagination : date (createdAt) de la derniere ligne deja affichee. */
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
