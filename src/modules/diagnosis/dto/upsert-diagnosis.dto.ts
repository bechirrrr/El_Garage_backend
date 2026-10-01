import { IsOptional, IsString } from 'class-validator';

/**
 * Un seul DTO pour create ET update (upsert, Section 13) : le diagnostic se
 * remplit progressivement (customerComplaint puis findings puis diagnosis
 * puis recommendation, au fil de l'examen du vehicule), donc tous les
 * champs sont optionnels des le depart plutot que d'avoir deux DTO
 * quasi-identiques.
 */
export class UpsertDiagnosisDto {
  @IsOptional()
  @IsString()
  customerComplaint?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsString()
  recommendation?: string;
}
