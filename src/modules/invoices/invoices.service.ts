import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, InvoiceStatus, Prisma } from '../../generated/prisma/client.js';
import { invoiceTotals } from '../../common/invoice-totals.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { UpdateInvoiceDto } from './dto/update-invoice.dto.js';

/**
 * Meme forme minimale que WorkOrdersService.EventWriter : tolere aussi bien
 * this.prisma (hors transaction) que `tx` (dans un $transaction). Dupliquee
 * volontairement plutot que factorisee entre modules, meme convention que
 * partout ailleurs dans ce projet.
 */
type EventWriter = { activityEvent: { create: (args: any) => Promise<unknown> } };

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getWorkOrder(garageId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }
    return workOrder;
  }

  /** GET -- renvoie null si aucune facture n'existe encore (comme DiagnosisService.findOne). */
  async findOne(garageId: string, workOrderId: string) {
    await this.getWorkOrder(garageId, workOrderId);

    return this.prisma.invoice.findUnique({
      where: { workOrderId },
      include: { payments: { orderBy: { paidAt: 'asc' } } },
    });
  }

  private async getInvoiceOrThrow(workOrderId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { workOrderId } });
    if (!invoice) {
      throw new NotFoundException('Aucune facture pour ce ticket.');
    }
    return invoice;
  }

  /**
   * Section 14/30bis : partsTotal n'est jamais saisi a la creation, il est
   * fige en sommant TOUTES les Parts existantes du ticket (voir le
   * commentaire dans part.prisma). Si des Parts sont ajoutees/modifiees
   * apres coup, InvoicesService.update permet de corriger partsTotal a la
   * main -- pas de recalcul automatique a posteriori.
   */
  private async computePartsTotal(workOrderId: string) {
    const parts = await this.prisma.part.findMany({
      where: { workOrderId },
      select: { quantity: true, unitPrice: true },
    });
    return parts.reduce(
      (sum, part) => sum.plus(part.quantity.times(part.unitPrice)),
      new Prisma.Decimal(0),
    );
  }

  /**
   * Une Invoice nait toujours DRAFT (Section 30, Option B deja tranchee) --
   * relation 1-1 avec le WorkOrder, donc une seule creation possible par
   * ticket (ConflictException sinon).
   */
  async create(garageId: string, actorId: string, workOrderId: string, dto: CreateInvoiceDto) {
    const workOrder = await this.getWorkOrder(garageId, workOrderId);

    const existing = await this.prisma.invoice.findUnique({ where: { workOrderId } });
    if (existing) {
      throw new ConflictException('Ce ticket a deja une facture.');
    }

    const laborPrice = new Prisma.Decimal(dto.laborPrice ?? 0);
    const partsTotal = await this.computePartsTotal(workOrderId);
    // TVA et timbre du garage COPIES sur la facture : changer les parametres
    // plus tard ne modifie jamais une facture existante.
    const garage = await this.prisma.garage.findUnique({
      where: { id: garageId },
      select: { vatEnabled: true, vatRate: true, stampDutyEnabled: true, stampDuty: true, invoiceDueDays: true },
    });
    const vatRate = garage?.vatEnabled ? garage.vatRate : new Prisma.Decimal(0);
    const stampDuty = garage?.stampDutyEnabled ? garage.stampDuty : new Prisma.Decimal(0);
    const { subtotal, vatAmount, totalPrice } = invoiceTotals(laborPrice, partsTotal, vatRate, stampDuty);
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : garage?.invoiceDueDays
        ? new Date(Date.now() + garage.invoiceDueDays * 86_400_000)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          garageId,
          workOrderId,
          customerId: workOrder.customerId,
          laborPrice,
          partsTotal,
          subtotal,
          vatRate,
          vatAmount,
          stampDuty,
          totalPrice,
          dueDate,
        },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'INVOICE_CREATED',
        category: ActivityCategory.SENSITIVE,
        message: `Facture creee (brouillon) -- total TTC ${totalPrice.toFixed(3)}`,
        metadata: {
          laborPrice: laborPrice.toFixed(3),
          partsTotal: partsTotal.toFixed(3),
          subtotal: subtotal.toFixed(3),
          vatRate: vatRate.toFixed(2),
          vatAmount: vatAmount.toFixed(3),
          stampDuty: stampDuty.toFixed(3),
          totalPrice: totalPrice.toFixed(3),
        },
      });

      return invoice;
    });
  }

  /**
   * Modifiable a tout moment sauf CANCELLED (Section 30bis : un prix
   * modifie APRES un paiement doit rester possible pour le MVP -- juste
   * visible et trace, pas bloque). `afterPayment` journalise ce cas
   * precis explicitement plutot que de le deviner depuis l'historique.
   */
  async update(garageId: string, actorId: string, workOrderId: string, dto: UpdateInvoiceDto) {
    await this.getWorkOrder(garageId, workOrderId);
    const invoice = await this.getInvoiceOrThrow(workOrderId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Facture annulee, non modifiable.');
    }

    const laborPrice = dto.laborPrice === undefined ? invoice.laborPrice : new Prisma.Decimal(dto.laborPrice);
    const partsTotal = dto.partsTotal === undefined ? invoice.partsTotal : new Prisma.Decimal(dto.partsTotal);
    // Recalcul avec le taux et le timbre de LA facture (pas ceux du garage aujourd'hui).
    const { subtotal, vatAmount, totalPrice } = invoiceTotals(laborPrice, partsTotal, invoice.vatRate, invoice.stampDuty);

    const paymentsCount = await this.prisma.payment.count({ where: { invoiceId: invoice.id } });
    const afterPayment = paymentsCount > 0 && !totalPrice.equals(invoice.totalPrice);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          laborPrice,
          partsTotal,
          subtotal,
          vatAmount,
          totalPrice,
          dueDate: dto.dueDate === undefined ? undefined : new Date(dto.dueDate),
        },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'INVOICE_PRICE_UPDATED',
        category: ActivityCategory.SENSITIVE,
        message: afterPayment
          ? `Prix modifie apres paiement : ${invoice.totalPrice.toFixed(3)} -> ${totalPrice.toFixed(3)}`
          : `Prix modifie : ${invoice.totalPrice.toFixed(3)} -> ${totalPrice.toFixed(3)}`,
        metadata: {
          field: 'totalPrice',
          old: invoice.totalPrice.toFixed(3),
          new: totalPrice.toFixed(3),
          afterPayment,
        },
      });

      return updated;
    });
  }

  /** DRAFT -> ISSUED (Section 32 : "Creates the Invoice (status = ISSUED)"). */
  async issue(garageId: string, actorId: string, workOrderId: string) {
    await this.getWorkOrder(garageId, workOrderId);
    const invoice = await this.getInvoiceOrThrow(workOrderId);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Seule une facture en brouillon peut etre emise.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.ISSUED, issuedById: actorId, issuedAt: new Date() },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'INVOICE_ISSUED',
        category: ActivityCategory.SENSITIVE,
        message: `Facture emise -- total ${invoice.totalPrice.toFixed(3)}`,
        metadata: { field: 'status', old: InvoiceStatus.DRAFT, new: InvoiceStatus.ISSUED },
      });

      return updated;
    });
  }

  /**
   * DRAFT ou ISSUED -> CANCELLED seulement -- pas apres un paiement, meme
   * partiel : l'argent a deja change de mains, annuler la facture a ce
   * stade masquerait un vrai mouvement financier (a rouvrir si un jour un
   * vrai flux de remboursement est modelise).
   */
  async cancel(garageId: string, actorId: string, workOrderId: string) {
    await this.getWorkOrder(garageId, workOrderId);
    const invoice = await this.getInvoiceOrThrow(workOrderId);

    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException('Cette facture ne peut plus etre annulee dans son etat actuel.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'INVOICE_CANCELLED',
        category: ActivityCategory.SENSITIVE,
        message: 'Facture annulee',
        metadata: { field: 'status', old: invoice.status, new: InvoiceStatus.CANCELLED },
      });

      return updated;
    });
  }

  async listPayments(garageId: string, workOrderId: string) {
    await this.getWorkOrder(garageId, workOrderId);
    const invoice = await this.getInvoiceOrThrow(workOrderId);

    return this.prisma.payment.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { paidAt: 'asc' },
    });
  }

  /**
   * N'accepte un paiement que sur une facture ISSUED/PARTIALLY_PAID -- pas
   * DRAFT (rien a payer avant emission), pas PAID/CANCELLED. Le montant ne
   * peut jamais depasser le solde restant du : garde-fou volontaire contre
   * une saisie erronee, la spec ne couvre pas le trop-percu/remboursement
   * (a rouvrir si un vrai cas se presente). Pas d'update/delete sur un
   * Payment une fois cree : un fait financier ne se modifie/supprime pas,
   * meme raisonnement que l'AuditLog de la Section 30bis.
   */
  async recordPayment(garageId: string, actorId: string, workOrderId: string, dto: CreatePaymentDto) {
    await this.getWorkOrder(garageId, workOrderId);
    const invoice = await this.getInvoiceOrThrow(workOrderId);

    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PARTIALLY_PAID) {
      throw new BadRequestException('Cette facture ne peut pas recevoir de paiement dans son etat actuel.');
    }

    const paid = await this.prisma.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amount: true },
    });
    const alreadyPaid = paid._sum.amount ?? new Prisma.Decimal(0);
    const amount = new Prisma.Decimal(dto.amount);
    const newTotalPaid = alreadyPaid.plus(amount);

    if (newTotalPaid.greaterThan(invoice.totalPrice)) {
      throw new BadRequestException('Le montant depasse le solde restant du sur cette facture.');
    }

    const newStatus = newTotalPaid.equals(invoice.totalPrice)
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIALLY_PAID;

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          garageId,
          invoiceId: invoice.id,
          amount,
          method: dto.method,
          recordedById: actorId,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        },
      });

      await tx.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'PAYMENT_RECORDED',
        category: ActivityCategory.SENSITIVE,
        message: `Paiement enregistre : ${amount.toFixed(3)} (${dto.method}) -- statut facture -> ${newStatus}`,
        metadata: {
          amount: amount.toFixed(3),
          method: dto.method,
          totalPaid: newTotalPaid.toFixed(3),
          invoiceStatus: newStatus,
        },
      });

      return payment;
    });
  }

  private recordEvent(
    client: EventWriter,
    event: {
      garageId: string;
      workOrderId: string;
      actorId: string | null;
      type: string;
      category: ActivityCategory;
      message: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return client.activityEvent.create({ data: event });
  }
}
