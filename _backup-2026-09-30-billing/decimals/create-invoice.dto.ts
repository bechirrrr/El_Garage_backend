import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Section 30 (Option B) : une Invoice nait toujours DRAFT (voir
 * @default(DRAFT) sur le schema) -- pas de champ status ici, seul
 * InvoicesService.issue() peut la faire passer a ISSUED.
 *
 * `partsTotal` n'est PAS dans ce DTO : il est calcule automatiquement en
 * sommant les Parts du ticket au moment de la creation (voir le
 * commentaire dans part.prisma -- "le total agrege... sera fige au moment
 * de la facturation"), jamais saisi a la main a la creation. Seul
 * `laborPrice` (la main d'oeuvre) demande un jugement humain.
 */
export class CreateInvoiceDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  laborPrice?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
