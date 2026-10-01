import { Prisma } from '../generated/prisma/client.js';

/**
 * Totaux d'une facture (Tunisie) : HT = main-d'oeuvre + pieces,
 * TVA = HT x taux (arrondie au millime), TTC = HT + TVA + timbre fiscal
 * (le timbre n'est pas soumis a la TVA).
 */
export function invoiceTotals(
  laborPrice: Prisma.Decimal,
  partsTotal: Prisma.Decimal,
  vatRate: Prisma.Decimal,
  stampDuty: Prisma.Decimal,
) {
  const subtotal = laborPrice.plus(partsTotal);
  const vatAmount = subtotal.times(vatRate).dividedBy(100).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  const totalPrice = subtotal.plus(vatAmount).plus(stampDuty);
  return { subtotal, vatAmount, totalPrice };
}
