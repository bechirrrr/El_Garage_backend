import { IsDateString, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/client.js';

/**
 * Section 30 : un Payment est immuable une fois enregistre (pas
 * d'UpdatePaymentDto/DeletePaymentDto -- un fait financier ne se
 * modifie/supprime pas, meme raisonnement que l'AuditLog de la Section
 * 30bis). `paidAt` optionnel : par defaut "maintenant", mais permet de
 * saisir un paiement recu plus tot dans la journee sans decaler l'heure
 * de saisie.
 */
export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.01)
  amount!: number;

  @IsIn(Object.values(PaymentMethod))
  method!: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
