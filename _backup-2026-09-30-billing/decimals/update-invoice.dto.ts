import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Contrairement a CreateInvoiceDto, `partsTotal` redevient modifiable ici :
 * une correction (remise, piece ajoutee apres coup...) doit rester
 * possible meme apres la creation -- y compris apres un paiement (Section
 * 30bis : "prix modifie apres paiement" doit etre visible et trace, pas
 * bloque pour le MVP). Voir InvoicesService.update pour le flag
 * `afterPayment` journalise dans ce cas.
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  laborPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  partsTotal?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
