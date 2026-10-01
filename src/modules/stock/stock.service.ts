import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AdjustStockDto, CreateStockItemDto, ReceiveStockDto, UpdateStockItemDto } from './dto/stock-item.dto.js';
import { MOVE, moveStock } from './stock-movements.js';

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

/**
 * Stock de pieces de rechange du garage (ecran Pieces > Stock).
 * Lecture : tous les membres (un mecanicien ajoute une piece du stock a son
 * OR). Creation, modification, entrees et inventaire : ADMIN et FRONT_DESK.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(garageId: string) {
    return this.prisma.stockItem.findMany({
      where: { garageId },
      orderBy: [{ isActive: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  private async getOwned(garageId: string, id: string) {
    const item = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!item || item.garageId !== garageId) throw new NotFoundException('Article de stock introuvable.');
    return item;
  }

  private rethrowDuplicate(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('Cette référence existe déjà dans votre stock.');
    }
    throw e;
  }

  async create(garageId: string, actorId: string, dto: CreateStockItemDto) {
    const initial = new Prisma.Decimal(dto.quantity ?? 0);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.stockItem.create({
          data: {
            garageId,
            name: dto.name.trim(),
            reference: clean(dto.reference),
            brand: clean(dto.brand),
            category: clean(dto.category),
            location: clean(dto.location),
            unit: dto.unit?.trim() || 'pc',
            supplier: clean(dto.supplier),
            minQuantity: dto.minQuantity ?? 0,
            purchasePrice: dto.purchasePrice ?? 0,
            salePrice: dto.salePrice ?? 0,
          },
        });
        if (initial.greaterThan(0)) {
          await moveStock(tx, {
            garageId,
            stockItemId: item.id,
            delta: initial,
            type: MOVE.IN,
            actorId,
            unitCost: dto.purchasePrice === undefined ? null : new Prisma.Decimal(dto.purchasePrice),
            note: 'Stock initial',
          });
        }
        return tx.stockItem.findUnique({ where: { id: item.id } });
      });
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  async update(garageId: string, id: string, dto: UpdateStockItemDto) {
    await this.getOwned(garageId, id);
    try {
      return await this.prisma.stockItem.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          reference: clean(dto.reference),
          brand: clean(dto.brand),
          category: clean(dto.category),
          location: clean(dto.location),
          unit: dto.unit?.trim() || undefined,
          supplier: clean(dto.supplier),
          minQuantity: dto.minQuantity,
          purchasePrice: dto.purchasePrice,
          salePrice: dto.salePrice,
          isActive: dto.isActive,
        },
      });
    } catch (e) {
      this.rethrowDuplicate(e);
    }
  }

  /** Livraison fournisseur : + quantite, et le prix d'achat devient celui de la livraison. */
  async receive(garageId: string, actorId: string, id: string, dto: ReceiveStockDto) {
    await this.getOwned(garageId, id);
    return this.prisma.$transaction(async (tx) => {
      await moveStock(tx, {
        garageId,
        stockItemId: id,
        delta: new Prisma.Decimal(dto.quantity),
        type: MOVE.IN,
        actorId,
        unitCost: dto.unitCost === undefined ? null : new Prisma.Decimal(dto.unitCost),
        note: dto.note?.trim() || null,
      });
      if (dto.unitCost !== undefined) {
        await tx.stockItem.update({ where: { id }, data: { purchasePrice: dto.unitCost } });
      }
      return tx.stockItem.findUnique({ where: { id } });
    });
  }

  /** Inventaire : la quantite comptee remplace le stock (ecart journalise). */
  async adjust(garageId: string, actorId: string, id: string, dto: AdjustStockDto) {
    const item = await this.getOwned(garageId, id);
    const delta = new Prisma.Decimal(dto.quantity).minus(item.quantity);
    if (delta.isZero()) return item;
    return this.prisma.$transaction(async (tx) => {
      await moveStock(tx, {
        garageId,
        stockItemId: id,
        delta,
        type: MOVE.ADJUST,
        actorId,
        note: dto.note?.trim() || 'Inventaire',
      });
      return tx.stockItem.findUnique({ where: { id } });
    });
  }

  /** Historique d'un article, le plus recent d'abord. */
  async movements(garageId: string, id: string) {
    await this.getOwned(garageId, id);
    return this.prisma.stockMovement.findMany({
      where: { stockItemId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        actor: { select: { id: true, name: true } },
        workOrder: { select: { id: true, number: true, vehicle: { select: { make: true, model: true, plate: true } } } },
      },
    });
  }

  /** Mouvements du garage sur une periode (resume "Sorties ce mois"). */
  recentMovements(garageId: string, from?: string) {
    return this.prisma.stockMovement.findMany({
      where: { garageId, ...(from ? { createdAt: { gte: new Date(from) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: { id: true, type: true, quantity: true, createdAt: true, stockItemId: true, workOrderId: true, partId: true },
    });
  }
}
