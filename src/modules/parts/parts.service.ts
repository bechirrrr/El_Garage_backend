import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma/client.js';
import { MOVE, moveStock } from '../stock/stock-movements.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePartDto } from './dto/create-part.dto.js';
import type { UpdatePartDto } from './dto/update-part.dto.js';

@Injectable()
export class PartsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Meme regle d'ownership que TasksService/DiagnosisService (Section 20) --
   * dupliquee volontairement plutot que factorisee, voir la note dans
   * DiagnosisService.getEditableWorkOrder.
   */
  private async getEditableWorkOrder(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
  ) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }
    if (userRole === Role.MECHANIC && workOrder.createdById !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que les tickets que vous avez crees.');
    }
    return workOrder;
  }

  /** Lecture ouverte aux 3 roles garage-scoped (visibilite, Section 20). */
  async findAllForWorkOrder(garageId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }

    return this.prisma.part.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Pas d'ActivityEvent ici, volontairement : meme decision que pour Task
   * et Symptom/DiagnosticTest -- une ligne de piece est un element de
   * checklist/liste, pas un evenement de timeline (Section 17). Le statut
   * "reparation bloquee en attente de piece" (Section 14) se derive en
   * lisant les Parts au statut ORDERED, pas via un log d'evenements.
   */
  async create(garageId: string, userId: string, userRole: Role, workOrderId: string, dto: CreatePartDto) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);

    if (!dto.stockItemId) {
      if (!dto.name || dto.unitPrice === undefined) {
        throw new BadRequestException('Nom et prix obligatoires pour une pièce hors stock.');
      }
      const { stockItemId: _none, ...data } = dto;
      return this.prisma.part.create({ data: { garageId, workOrderId, ...data, name: dto.name, unitPrice: dto.unitPrice } });
    }

    // Piece du stock : reprise de l'article + sortie de stock, dans la meme transaction.
    const stockItemId = dto.stockItemId;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item || item.garageId !== garageId || !item.isActive) {
        throw new NotFoundException('Article de stock introuvable.');
      }
      const quantity = new Prisma.Decimal(dto.quantity ?? 1);
      const part = await tx.part.create({
        data: {
          garageId,
          workOrderId,
          stockItemId,
          name: dto.name?.trim() || item.name,
          quantity,
          unit: dto.unit ?? item.unit,
          unitPrice: dto.unitPrice ?? item.salePrice,
        },
      });
      await moveStock(tx, {
        garageId,
        stockItemId,
        delta: quantity.negated(),
        type: MOVE.OUT,
        actorId: userId,
        workOrderId,
        partId: part.id,
      });
      return part;
    });
  }

  private async getOwnedPart(workOrderId: string, partId: string) {
    const part = await this.prisma.part.findUnique({ where: { id: partId } });
    if (!part || part.workOrderId !== workOrderId) {
      throw new NotFoundException('Piece introuvable.');
    }
    return part;
  }

  async update(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    partId: string,
    dto: UpdatePartDto,
  ) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    const part = await this.getOwnedPart(workOrderId, partId);

    // Piece du stock dont la quantite change : le stock suit (sortie ou retour de la difference).
    const delta =
      part.stockItemId && dto.quantity !== undefined ? new Prisma.Decimal(dto.quantity).minus(part.quantity) : null;
    if (!delta || delta.isZero()) {
      return this.prisma.part.update({ where: { id: partId }, data: dto });
    }
    return this.prisma.$transaction(async (tx) => {
      await moveStock(tx, {
        garageId,
        stockItemId: part.stockItemId as string,
        delta: delta.negated(),
        type: delta.isPositive() ? MOVE.OUT : MOVE.RETURN,
        actorId: userId,
        workOrderId,
        partId,
      });
      return tx.part.update({ where: { id: partId }, data: dto });
    });
  }

  async remove(garageId: string, userId: string, userRole: Role, workOrderId: string, partId: string) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    const part = await this.getOwnedPart(workOrderId, partId);

    if (!part.stockItemId) {
      return this.prisma.part.delete({ where: { id: partId } });
    }
    // Retiree de l'OR : la piece revient en stock.
    return this.prisma.$transaction(async (tx) => {
      await moveStock(tx, {
        garageId,
        stockItemId: part.stockItemId as string,
        delta: new Prisma.Decimal(part.quantity),
        type: MOVE.RETURN,
        actorId: userId,
        workOrderId,
        partId,
      });
      return tx.part.delete({ where: { id: partId } });
    });
  }

  /**
   * Toutes les pieces du garage (ecran Pieces > Suivi des OR), avec leur OR,
   * son vehicule et son mecanicien. Lecture ouverte aux 3 roles.
   */
  findAllForGarage(garageId: string) {
    return this.prisma.part.findMany({
      where: { garageId },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      include: {
        stockItem: { select: { id: true, reference: true } },
        workOrder: {
          select: {
            id: true,
            number: true,
            status: true,
            createdById: true,
            assignedMechanicId: true,
            assignedMechanic: { select: { id: true, name: true } },
            vehicle: { select: { make: true, model: true, plate: true } },
          },
        },
      },
    });
  }
}
