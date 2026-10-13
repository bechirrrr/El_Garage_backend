import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, InvoiceStatus, Prisma } from '../../generated/prisma/client.js';
import { syncInvoicePartsTotal } from '../../common/invoice-parts-sync.js';
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
   * apres coup, InvoicesService.update refait cette somme : le montant
   * Pieces vient toujours des pieces de l'OR, jamais d'une saisie libre.
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
   *
   * Exception : une facture ANNULEE peut etre recreee. Comme la relation
   * reste 1-1, on reutilise la meme ligne, remise a zero en DRAFT (elle n'a
   * jamais de paiement : cancel() n'est permis qu'en DRAFT/ISSUED).
   * L'annulation et la recreation restent visibles dans l'historique de l'OR.
   */
  async create(garageId: string, actorId: string, workOrderId: string, dto: CreateInvoiceDto) {
    const workOrder = await this.getWorkOrder(garageId, workOrderId);

    const existing = await this.prisma.invoice.findUnique({ where: { workOrderId } });
    if (existing && existing.status !== InvoiceStatus.CANCELLED) {
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

    // Deux creations simultanees : la contrainte @unique(workOrderId) rejette
    // la 2e (P2002) -> meme 409 que le controle ci-dessus, pas une erreur 500.
    return this.prisma.$transaction(async (tx) => {
      const amounts = { laborPrice, partsTotal, subtotal, vatRate, vatAmount, stampDuty, totalPrice };
      const invoice = existing
        ? await tx.invoice.update({
            where: { id: existing.id },
            data: {
              ...amounts,
              customerId: workOrder.customerId,
              status: InvoiceStatus.DRAFT,
              issuedById: null,
              issuedAt: null,
              dueDate: dueDate ?? null,
            },
          })
        : await tx.invoice.create({
            data: { garageId, workOrderId, customerId: workOrder.customerId, ...amounts, dueDate },
          });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'INVOICE_CREATED',
        category: ActivityCategory.SENSITIVE,
        message: `Facture ${existing ? 'recreee apres annulation' : 'creee'} (brouillon) -- total TTC ${totalPrice.toFixed(3)}`,
        metadata: {
          recreated: Boolean(existing),
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
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ce ticket a deja une facture.');
      }
      throw error;
    });
  }

  /**
   * Verrouille la ligne de la facture (SELECT ... FOR UPDATE) puis la relit,
   * DANS la transaction passee en parametre.
   *
   * Pourquoi : update, issue, cancel, recordPayment et refund lisaient la
   * facture (statut, montants deja payes) AVANT leur transaction. Deux
   * requetes simultanees voyaient donc le meme etat -- ex. deux paiements de
   * 60 sur une facture de 100 lisaient tous les deux "0 deja paye" et
   * passaient (120 encaisses), ou une annulation passait pendant qu'un
   * paiement etait enregistre. Avec le verrou, la 2e requete attend la fin de
   * la 1re puis relit l'etat a jour. Meme principe que le compteur de numeros d'OR.
   */
  private async lockInvoice(tx: Prisma.TransactionClient, workOrderId: string) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE work_order_id = ${workOrderId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { workOrderId } });
    if (!invoice) {
      throw new NotFoundException('Aucune facture pour ce ticket.');
    }
    return invoice;
  }

  /** Somme des paiements (remboursements negatifs inclus) d'une facture, 0 si aucun. */
  private async sumPayments(tx: Prisma.TransactionClient, invoiceId: string) {
    const paid = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    return paid._sum.amount ?? new Prisma.Decimal(0);
  }

  /**
   * Modifiable a tout moment sauf CANCELLED (Section 30bis : un prix
   * modifie APRES un paiement doit rester possible pour le MVP -- juste
   * visible et trace, pas bloque). `afterPayment` journalise ce cas
   * precis explicitement plutot que de le deviner depuis l'historique.
   *
   * Pieces HT est toujours RECALCULE depuis les Parts de l'OR : pour
   * facturer une piece de plus, on ajoute la piece (stock ou hors stock),
   * pas un montant.
   *
   * Statut et montants sont relus SOUS VERROU (lockInvoice).
   */
  async update(garageId: string, actorId: string, workOrderId: string, dto: UpdateInvoiceDto) {
    await this.getWorkOrder(garageId, workOrderId);
    const partsTotal = await this.computePartsTotal(workOrderId);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, workOrderId);

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Facture annulee, non modifiable.');
      }

      const laborPrice = dto.laborPrice === undefined ? invoice.laborPrice : new Prisma.Decimal(dto.laborPrice);
      // Recalcul avec le taux et le timbre de LA facture (pas ceux du garage aujourd'hui).
      const { subtotal, vatAmount, totalPrice } = invoiceTotals(laborPrice, partsTotal, invoice.vatRate, invoice.stampDuty);

      const paymentsCount = await tx.payment.count({ where: { invoiceId: invoice.id } });
      const afterPayment = paymentsCount > 0 && !totalPrice.equals(invoice.totalPrice);

      // Le statut de paiement suit le NOUVEAU total : une facture PAID dont le
      // prix augmente redevient PARTIALLY_PAID (recordPayment accepte alors la
      // difference), et une facture PARTIALLY_PAID dont le prix descend au niveau
      // de ce qui est deja encaisse devient PAID. DRAFT/ISSUED ne bougent pas.
      // Un total inferieur a l'encaisse reste permis : c'est un trop-percu, a
      // rendre au client via refund().
      let status = invoice.status;
      if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.PARTIALLY_PAID) {
        const totalPaid = await this.sumPayments(tx, invoice.id);
        status = totalPaid.greaterThanOrEqualTo(totalPrice) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      }

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          laborPrice,
          partsTotal,
          subtotal,
          vatAmount,
          totalPrice,
          status,
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
          oldPartsTotal: invoice.partsTotal.toFixed(3),
          newPartsTotal: partsTotal.toFixed(3),
          afterPayment,
          ...(status !== invoice.status ? { oldStatus: invoice.status, newStatus: status } : {}),
        },
      });

      return updated;
    });
  }

  /** DRAFT -> ISSUED (Section 32 : "Creates the Invoice (status = ISSUED)"). */
  async issue(garageId: string, actorId: string, workOrderId: string) {
    await this.getWorkOrder(garageId, workOrderId);
    // Filet de securite : on n'emet jamais une facture dont le total Pieces est en retard sur l'OR.
    await syncInvoicePartsTotal(this.prisma, { garageId, workOrderId, actorId });

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, workOrderId);

      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Seule une facture en brouillon peut etre emise.');
      }

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
   *
   * Le statut est relu sous verrou : un paiement enregistre au meme moment
   * passe soit avant (-> annulation refusee), soit apres (-> paiement refuse
   * car la facture est CANCELLED), jamais les deux.
   */
  async cancel(garageId: string, actorId: string, workOrderId: string) {
    await this.getWorkOrder(garageId, workOrderId);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, workOrderId);

      if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.ISSUED) {
        throw new BadRequestException('Cette facture ne peut plus etre annulee dans son etat actuel.');
      }

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
   * une saisie erronee (le trop-percu passe par refund()). Pas d'update/delete
   * sur un Payment une fois cree : un fait financier ne se modifie/supprime
   * pas, meme raisonnement que l'AuditLog de la Section 30bis.
   *
   * Statut et solde sont lus SOUS VERROU (lockInvoice) : deux paiements
   * simultanes ne peuvent plus depasser le total a eux deux.
   */
  async recordPayment(garageId: string, actorId: string, workOrderId: string, dto: CreatePaymentDto) {
    await this.getWorkOrder(garageId, workOrderId);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, workOrderId);

      if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PARTIALLY_PAID) {
        throw new BadRequestException('Cette facture ne peut pas recevoir de paiement dans son etat actuel.');
      }

      const alreadyPaid = await this.sumPayments(tx, invoice.id);
      const amount = new Prisma.Decimal(dto.amount);
      const newTotalPaid = alreadyPaid.plus(amount);

      if (newTotalPaid.greaterThan(invoice.totalPrice)) {
        throw new BadRequestException('Le montant depasse le solde restant du sur cette facture.');
      }

      const newStatus = newTotalPaid.equals(invoice.totalPrice)
        ? InvoiceStatus.PAID
        : InvoiceStatus.PARTIALLY_PAID;

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

  /**
   * Remboursement d'un trop-percu : la facture a ete baissee APRES paiement
   * (voir update()), le client a donc paye plus que le total. Le remboursement
   * est un Payment de montant NEGATIF : toutes les sommes existantes (deja
   * paye, reste a payer, caisse de la periode) restent justes sans cas
   * particulier, et le fait financier reste immuable comme un paiement.
   *
   * Plafonne au trop-percu : on ne rembourse jamais plus que
   * (total paye - total facture). Calcule SOUS VERROU : deux remboursements
   * simultanes ne peuvent pas rendre deux fois le meme trop-percu.
   */
  async refund(garageId: string, actorId: string, workOrderId: string, dto: CreatePaymentDto) {
    await this.getWorkOrder(garageId, workOrderId);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, workOrderId);

      const totalPaid = await this.sumPayments(tx, invoice.id);
      const overpaid = totalPaid.minus(invoice.totalPrice);
      if (!overpaid.isPositive()) {
        throw new BadRequestException("Aucun trop-perçu à rembourser sur cette facture.");
      }

      const amount = new Prisma.Decimal(dto.amount);
      if (amount.greaterThan(overpaid)) {
        throw new BadRequestException(`Le remboursement dépasse le trop-perçu (${overpaid.toFixed(3)} DT).`);
      }
      const newTotalPaid = totalPaid.minus(amount);

      const payment = await tx.payment.create({
        data: {
          garageId,
          invoiceId: invoice.id,
          amount: amount.negated(),
          method: dto.method,
          recordedById: actorId,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId,
        actorId,
        type: 'PAYMENT_REFUNDED',
        category: ActivityCategory.SENSITIVE,
        message: `Remboursement enregistre : ${amount.toFixed(3)} (${dto.method})`,
        metadata: { amount: amount.toFixed(3), method: dto.method, totalPaid: newTotalPaid.toFixed(3) },
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
