import { ActivityCategory, InvoiceStatus, Prisma } from '../generated/prisma/client.js';
import { invoiceTotals } from './invoice-totals.js';

/**
 * Client minimal utilise ici : `tx` d'un $transaction (ou this.prisma).
 * Type pragmatique, meme convention que EventWriter dans les services.
 */
type Tx = {
  invoice: { findUnique: (args: any) => Promise<any>; create: (args: any) => Promise<any>; update: (args: any) => Promise<any> };
  part: { findMany: (args: any) => Promise<{ quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[]> };
  garage: { findUnique: (args: any) => Promise<any> };
  activityEvent: { create: (args: any) => Promise<unknown> };
};

/**
 * Un OR qui passe a COMPLETED ("Terminé") doit apparaitre dans Facturation
 * comme facture a encaisser, donc ISSUED ("Non payée") :
 *  - pas de facture (ou facture annulee)  -> creee directement ISSUED ;
 *  - facture DRAFT                         -> pieces recalculees puis emise ;
 *  - ISSUED / PARTIALLY_PAID / PAID        -> rien (deja facturee).
 *
 * Main-d'oeuvre : celle du brouillon / de la facture annulee si elle existe,
 * sinon 0 (modifiable ensuite dans l'onglet Facture, comme toute facture
 * non annulee). TVA, timbre et echeance copies depuis le garage, comme
 * InvoicesService.create.
 */
export async function autoIssueInvoiceOnCompletion(
  tx: Tx,
  ctx: { garageId: string; workOrderId: string; customerId: string; actorId: string },
): Promise<void> {
  const existing = await tx.invoice.findUnique({ where: { workOrderId: ctx.workOrderId } });
  if (existing && existing.status !== InvoiceStatus.DRAFT && existing.status !== InvoiceStatus.CANCELLED) return;

  const parts = await tx.part.findMany({
    where: { workOrderId: ctx.workOrderId },
    select: { quantity: true, unitPrice: true },
  });
  const partsTotal = parts.reduce((sum, p) => sum.plus(p.quantity.times(p.unitPrice)), new Prisma.Decimal(0));
  const laborPrice: Prisma.Decimal = existing?.laborPrice ?? new Prisma.Decimal(0);
  const now = new Date();

  let vatRate: Prisma.Decimal;
  let stampDuty: Prisma.Decimal;
  let dueDate: Date | null;
  if (existing?.status === InvoiceStatus.DRAFT) {
    // Un brouillon garde ses taux et son echeance (fixes a sa creation).
    vatRate = existing.vatRate;
    stampDuty = existing.stampDuty;
    dueDate = existing.dueDate;
  } else {
    const garage = await tx.garage.findUnique({
      where: { id: ctx.garageId },
      select: { vatEnabled: true, vatRate: true, stampDutyEnabled: true, stampDuty: true, invoiceDueDays: true },
    });
    vatRate = garage?.vatEnabled ? garage.vatRate : new Prisma.Decimal(0);
    stampDuty = garage?.stampDutyEnabled ? garage.stampDuty : new Prisma.Decimal(0);
    dueDate = garage?.invoiceDueDays ? new Date(now.getTime() + garage.invoiceDueDays * 86_400_000) : null;
  }
  const { subtotal, vatAmount, totalPrice } = invoiceTotals(laborPrice, partsTotal, vatRate, stampDuty);

  const data = {
    customerId: ctx.customerId,
    laborPrice,
    partsTotal,
    subtotal,
    vatRate,
    vatAmount,
    stampDuty,
    totalPrice,
    dueDate,
    status: InvoiceStatus.ISSUED,
    issuedById: ctx.actorId,
    issuedAt: now,
  };
  if (existing) {
    await tx.invoice.update({ where: { id: existing.id }, data });
  } else {
    await tx.invoice.create({ data: { garageId: ctx.garageId, workOrderId: ctx.workOrderId, ...data } });
  }

  await tx.activityEvent.create({
    data: {
      garageId: ctx.garageId,
      workOrderId: ctx.workOrderId,
      actorId: ctx.actorId,
      type: 'INVOICE_ISSUED',
      category: ActivityCategory.SENSITIVE,
      message: `Facture emise automatiquement (OR termine) -- total TTC ${totalPrice.toFixed(3)}, non payee`,
      metadata: {
        auto: true,
        field: 'status',
        old: existing?.status ?? null,
        new: InvoiceStatus.ISSUED,
        laborPrice: laborPrice.toFixed(3),
        partsTotal: partsTotal.toFixed(3),
        totalPrice: totalPrice.toFixed(3),
      },
    },
  });
}
