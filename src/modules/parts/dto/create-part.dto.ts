import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateIf } from 'class-validator';

/**
 * Section 14 : une Part nait toujours AVAILABLE (comme une Task nait TODO)
 * -- pas de champ `status` ici, seul UpdatePartDto peut le faire avancer
 * (AVAILABLE -> ORDERED -> RECEIVED -> USED).
 *
 * quantity/unitPrice en `number` cote DTO (class-validator n'a pas de type
 * Decimal natif) : Prisma accepte un number en entree et le convertit lui-
 * meme en Decimal(10,2) au moment de l'ecriture -- @IsNumber({maxDecimalPlaces:2})
 * borne la precision des le validation pipe, avant meme d'atteindre Prisma.
 *
 * Pas de `totalPrice` : (quantity * unitPrice) se calcule a la volee cote
 * code, jamais stocke (voir le commentaire dans part.prisma).
 */
export class CreatePartDto {
  /** Piece prise dans le stock : nom, unite et prix de vente repris de l'article, stock decremente. */
  @IsOptional()
  @IsUUID()
  stockItemId?: string;

  /** Obligatoire pour une piece hors stock ; sinon le nom de l'article du stock. */
  @ValidateIf((o: CreatePartDto) => !o.stockItemId || o.name !== undefined)
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  /** Obligatoire hors stock ; sinon le prix de vente de l'article (modifiable). */
  @ValidateIf((o: CreatePartDto) => !o.stockItemId || o.unitPrice !== undefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitPrice?: number;
}
