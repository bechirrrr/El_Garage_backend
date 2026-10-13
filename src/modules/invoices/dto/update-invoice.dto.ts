import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * `partsTotal` n'est PAS modifiable a la main, comme a la creation : pour
 * facturer une piece de plus (y compris apres un paiement), on ajoute la
 * PIECE a l'OR -- InvoicesService.update recalcule alors Pieces HT en
 * sommant les Parts. Un montant saisi sans piece derriere n'est plus accepte.
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  laborPrice?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
