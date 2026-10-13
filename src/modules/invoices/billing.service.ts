import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, InvoiceStatus, Prisma, WorkOrderStatus } from '../../generated/prisma/client.js';
import { invoiceTotals } from '../../common/invoice-totals.js';
import { assertMileageNotDecreasing } from '../../common/mileage.js';
import { nextWorkOrderNumber } from '../../common/work-order-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MOVE, moveStock } from '../stock/stock-movements.js';
import type { CreateDirectInvoiceDto } from './dto/create-direct-invoice.dto.js';

/**
 * Vues "garage entier" de la facturation (ecran Facturation & caisse) :
 * toutes les factures, les paiements d'une periode, et la facture directe
 * (createDirect). Les actions sur une facture existante (emettre,
 * encaisser...) restent sur /work-orders/:workOrderId/invoice (InvoicesService).
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

  /**
   * Facture directe (comptoir) : client + vehicule existants ou crees a la
   * volee, un OR "Terminé" cree pour porter la facture (Invoice est 1-1 avec
   * WorkOrder), ses pieces (sortie de stock si piece du stock) et la facture,
   * emise par defaut ("Non payée"). Tout ou rien : une seule transaction.
   *
   * Reutilisation plutot que doublon :
   *  - client saisi avec un telephone deja connu -> ce client ;
   *  - plaque deja connue -> ce vehicule, s'il appartient au meme client
   *    (sinon conflit : on ne change pas un proprietaire en silence).
   */
  async createDirect(garageId: string, actorId: string, dto: CreateDirectInvoiceDto) {
    if (!dto.customerId && !dto.customer) throw new BadRequestException('Choisissez un client ou saisissez-en un.');
    if (!dto.vehicleId && !dto.vehicle) throw new BadRequestException('Choisissez un véhicule ou saisissez-en un.');
    const lines = dto.parts ?? [];
    for (const l of lines) {
      if (!l.stockItemId && (!l.name?.trim() || l.unitPrice === undefined)) {
        throw new BadRequestException('Nom et prix obligatoires pour une pièce hors stock.');
      }
    }

    // Vehicule existant : controle du kilometrage AVANT la transaction (lecture seule).
    if (dto.vehicleId && dto.mileage !== undefined) {
      const v = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (v && v.garageId === garageId) {
        await assertMileageNotDecreasing(this.prisma, { garageId, vehicleId: v.id, mileage: dto.mileage, vehicleMileage: v.mileage });
      }
    }

    const garage = await this.prisma.garage.findUnique({
      where: { id: garageId },
      select: { vatEnabled: true, vatRate: true, stampDutyEnabled: true, stampDuty: true, invoiceDueDays: true },
    });
    const vatRate = garage?.vatEnabled ? garage.vatRate : new Prisma.Decimal(0);
    const stampDuty = garage?.stampDutyEnabled ? garage.stampDuty : new Prisma.Decimal(0);
    const now = new Date();
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : garage?.invoiceDueDays
        ? new Date(now.getTime() + garage.invoiceDueDays * 86_400_000)
        : null;
    const issue = dto.issue !== false;

    return this.prisma.$transaction(async (tx) => {
      const event = (data: Omit<Prisma.ActivityEventUncheckedCreateInput, 'garageId' | 'actorId'>) =>
        tx.activityEvent.create({ data: { garageId, actorId, category: ActivityCategory.GENERAL, ...data } });

      // 1. Client
      let customer: { id: string; name: string };
      if (dto.customerId) {
        const found = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!found || found.garageId !== garageId) throw new NotFoundException('Client introuvable dans ce garage.');
        customer = found;
      } else {
        const phone = dto.customer!.phone?.trim() || undefined;
        const known = phone ? await tx.customer.findUnique({ where: { garageId_phone: { garageId, phone } } }) : null;
        if (known) {
          customer = known;
        } else {
          customer = await tx.customer.create({
            data: { garageId, name: dto.customer!.name.trim(), phone, email: dto.customer!.email?.trim() || undefined },
          });
          await event({ customerId: customer.id, type: 'CUSTOMER_CREATED', message: `Client ajouté : ${customer.name}` });
        }
      }

      // 2. Vehicule
      let vehicle: { id: string; customerId: string; make: string; model: string; plate: string };
      if (dto.vehicleId) {
        const found = await tx.vehicle.findUnique({ where: { id: dto.vehicleId } });
        if (!found || found.garageId !== garageId) throw new NotFoundException('Véhicule introuvable dans ce garage.');
        if (found.customerId !== customer.id) throw new BadRequestException("Ce véhicule n'appartient pas à ce client.");
        vehicle = found;
      } else {
        const v = dto.vehicle!;
        const known = await tx.vehicle.findUnique({ where: { garageId_plate: { garageId, plate: v.plate } } });
        if (known) {
          if (known.customerId !== customer.id) {
            throw new ConflictException(`La plaque ${v.plate} est déjà enregistrée pour un autre client.`);
          }
          vehicle = known;
        } else {
          vehicle = await tx.vehicle.create({
            data: {
              garageId,
              createdById: actorId,
              customerId: customer.id,
              make: v.make.trim(),
              model: v.model.trim(),
              plate: v.plate,
              year: v.year,
              mileage: dto.mileage,
            },
          });
          await event({
            vehicleId: vehicle.id,
            customerId: customer.id,
            type: 'VEHICLE_CREATED',
            message: `Véhicule ajouté : ${vehicle.make} ${vehicle.model} (${vehicle.plate}) pour ${customer.name}`,
          });
        }
      }

      // 3. OR termine qui porte la facture
      const number = await nextWorkOrderNumber(tx, garageId);
      const workOrder = await tx.workOrder.create({
        data: {
          garageId,
          number,
          vehicleId: vehicle.id,
          customerId: customer.id,
          createdById: actorId,
          mileage: dto.mileage,
          problemReported: dto.description?.trim() || 'Facture directe (comptoir)',
          status: WorkOrderStatus.COMPLETED,
          scheduledAt: now,
        },
      });
      await event({
        workOrderId: workOrder.id,
        type: 'WORK_ORDER_CREATED',
        message: `OR-${number} créé depuis Facturation (facture directe) pour ${vehicle.make} ${vehicle.model} (${vehicle.plate})`,
      });

      // 4. Pieces (+ sortie de stock)
      let partsTotal = new Prisma.Decimal(0);
      for (const l of lines) {
        const quantity = new Prisma.Decimal(l.quantity);
        let data: { name: string; unit: string | null; unitPrice: Prisma.Decimal; stockItemId?: string };
        if (l.stockItemId) {
          const item = await tx.stockItem.findUnique({ where: { id: l.stockItemId } });
          if (!item || item.garageId !== garageId || !item.isActive) throw new NotFoundException('Article de stock introuvable.');
          data = {
            stockItemId: item.id,
            name: l.name?.trim() || item.name,
            unit: l.unit ?? item.unit,
            unitPrice: l.unitPrice !== undefined ? new Prisma.Decimal(l.unitPrice) : item.salePrice,
          };
        } else {
          data = { name: l.name!.trim(), unit: l.unit?.trim() || null, unitPrice: new Prisma.Decimal(l.unitPrice!) };
        }
        const part = await tx.part.create({ data: { garageId, workOrderId: workOrder.id, quantity, ...data } });
        if (data.stockItemId) {
          await moveStock(tx, {
            garageId,
            stockItemId: data.stockItemId,
            delta: quantity.negated(),
            type: MOVE.OUT,
            actorId,
            workOrderId: workOrder.id,
            partId: part.id,
          });
        }
        partsTotal = partsTotal.plus(quantity.times(data.unitPrice));
      }

      // 5. Facture
      const laborPrice = new Prisma.Decimal(dto.laborPrice ?? 0);
      const { subtotal, vatAmount, totalPrice } = invoiceTotals(laborPrice, partsTotal, vatRate, stampDuty);
      const invoice = await tx.invoice.create({
        data: {
          garageId,
          workOrderId: workOrder.id,
          customerId: customer.id,
          laborPrice,
          partsTotal,
          subtotal,
          vatRate,
          vatAmount,
          stampDuty,
          totalPrice,
          dueDate,
          status: issue ? InvoiceStatus.ISSUED : InvoiceStatus.DRAFT,
          issuedById: issue ? actorId : null,
          issuedAt: issue ? now : null,
        },
      });
      await event({
        workOrderId: workOrder.id,
        type: issue ? 'INVOICE_ISSUED' : 'INVOICE_CREATED',
        category: ActivityCategory.SENSITIVE,
        message: `Facture directe ${issue ? 'émise (non payée)' : 'créée (brouillon)'} -- total TTC ${totalPrice.toFixed(3)}`,
        metadata: { direct: true, laborPrice: laborPrice.toFixed(3), partsTotal: partsTotal.toFixed(3), totalPrice: totalPrice.toFixed(3) },
      });

      return { ...invoice, workOrder: { id: workOrder.id, number } };
    });
  }
}
