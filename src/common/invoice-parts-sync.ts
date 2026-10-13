import { ActivityCategory, InvoiceStatus, Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { invoiceTotals } from './invoice-totals.js';

/**
 * Garde "Pieces HT" de la facture egal a la somme des pieces de l'OR.
 *
 * Appele apres chaque ajout / modification / suppression de piece, et avant
 * l'emission : sans ca, une piece ajoutee APRES la creation de la facture
 * (brouillon) n'apparaissait jamais dans le total facture.
 *
 * Ne fait rien s'il n'y a pas de facture, si elle est annulee, ou si le total
 * n'a pas change. Les totaux sont recalcules avec la TVA et le timbre DE LA
 * FACTURE ; pour une facture deja encaissee, le statut suit le nouveau total
 * (meme regle que InvoicesService.update).
 */
export async function syncInvoicePartsTotal(
  prisma: PrismaService,
  ctx: { garageId: string; workOrderId: string; actorId: string | null },
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { workOrderId: ctx.workOrderId } });
  if (!invoice || invoice.status === InvoiceStatus.CANCELLED) return;

  const parts = await prisma.part.findMany({
    where: { workOrderId: ctx.workOrderId },
    select: { quantity: true, unitPrice: true },
  });
  const partsTotal = parts.reduce((sum, p) => sum.plus(p.quantity.times(p.unitPrice)), new Prisma.Decimal(0));
  if (partsTotal.equals(invoice.partsTotal)) return;

  const { subtotal, vatAmount, totalPrice } = invoiceTotals(invoice.laborPrice, partsTotal, invoice.vatRate, invoice.stampDuty);

  let status = invoice.status;
  const collected = invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.PARTIALLY_PAID;
  if (collected) {
    const paid = await prisma.payment.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
    const totalPaid = paid._sum.amount ?? new Prisma.Decimal(0);
    status = totalPaid.greaterThanOrEqualTo(totalPrice) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { partsTotal, subtotal, vatAmount, totalPrice, status },
    });
    await tx.activityEvent.create({
      data: {
        garageId: ctx.garageId,
        workOrderId: ctx.workOrderId,
        actorId: ctx.actorId,
        type: 'INVOICE_PRICE_UPDATED',
        category: ActivityCategory.SENSITIVE,
        message: `Facture mise a jour (pieces modifiees) : ${invoice.totalPrice.toFixed(3)} -> ${totalPrice.toFixed(3)}`,
        metadata: {
          field: 'totalPrice',
          old: invoice.totalPrice.toFixed(3),
          new: totalPrice.toFixed(3),
          oldPartsTotal: invoice.partsTotal.toFixed(3),
          newPartsTotal: partsTotal.toFixed(3),
          afterPayment: collected,
          source: 'parts',
          ...(status !== invoice.status ? { oldStatus: invoice.status, newStatus: status } : {}),
        },
      },
    });
  });
}
