import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Vues "garage entier" de la facturation (ecran Facturation & caisse),
 * en lecture seule : toutes les factures, et les paiements d'une periode.
 * Les actions (creer, emettre, encaisser...) restent sur
 * /work-orders/:workOrderId/invoice (InvoicesService).
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Toutes les factures du garage, les plus recentes d'abord, avec leurs paiements, l'OR et le client. */
  findAllInvoices(garageId: string) {
    return this.prisma.invoice.findMany({
      where: { garageId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: { select: { id: true, amount: true, method: true, paidAt: true }, orderBy: { paidAt: 'asc' } },
        customer: { select: { id: true, name: true, phone: true } },
        workOrder: {
          select: { id: true, number: true, vehicle: { select: { make: true, model: true, plate: true } } },
        },
      },
    });
  }

  /** Paiements enregistres entre from (inclus) et to (exclu) -- sans bornes : tous. */
  findPayments(garageId: string, from?: string, to?: string) {
    return this.prisma.payment.findMany({
      where: {
        garageId,
        paidAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lt: new Date(to) } : {}),
        },
      },
      orderBy: { paidAt: 'desc' },
      include: {
        recordedBy: { select: { id: true, name: true } },
        invoice: {
          select: {
            id: true,
            totalPrice: true,
            status: true,
            customer: { select: { id: true, name: true } },
            workOrder: {
              select: { id: true, number: true, vehicle: { select: { make: true, model: true, plate: true } } },
            },
          },
        },
      },
    });
  }
}
