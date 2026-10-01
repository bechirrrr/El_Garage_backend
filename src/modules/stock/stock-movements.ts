import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, type StockMovementType } from '../../generated/prisma/client.js';

/** Valeurs de l'enum StockMovementType (constantes locales : lisibles et testables sans client genere). */
export const MOVE = {
  IN: 'IN',
  OUT: 'OUT',
  RETURN: 'RETURN',
  ADJUST: 'ADJUST',
} as const satisfies Record<StockMovementType, StockMovementType>;

/** Client Prisma OU transaction (tx) : juste ce que les mouvements utilisent. */
export type StockClient = {
  stockItem: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  stockMovement: { create: (args: any) => Promise<any> };
};

const fmt = (d: Prisma.Decimal) => d.toNumber().toLocaleString('fr-FR');

/**
 * Applique une variation de stock et journalise le mouvement.
 * Une sortie (delta < 0) est refusee si le stock ne suffit pas : la mise a
 * jour est conditionnelle (quantity >= besoin), donc deux ajouts simultanes
 * ne peuvent pas faire passer le stock en negatif.
 */
export async function moveStock(
  client: StockClient,
  m: {
    garageId: string;
    stockItemId: string;
    delta: Prisma.Decimal;
    type: StockMovementType;
    actorId?: string | null;
    workOrderId?: string | null;
    partId?: string | null;
    unitCost?: Prisma.Decimal | null;
    note?: string | null;
  },
) {
  const item = await client.stockItem.findUnique({ where: { id: m.stockItemId } });
  if (!item || item.garageId !== m.garageId) throw new NotFoundException('Article de stock introuvable.');

  if (m.delta.isNegative()) {
    const need = m.delta.abs();
    const res = await client.stockItem.updateMany({
      where: { id: m.stockItemId, quantity: { gte: need } },
      data: { quantity: { decrement: need } },
    });
    if (res.count === 0) {
      throw new BadRequestException(
        `Stock insuffisant pour « ${item.name} » : il reste ${fmt(new Prisma.Decimal(item.quantity))} ${item.unit}.`,
      );
    }
  } else if (!m.delta.isZero()) {
    await client.stockItem.update({ where: { id: m.stockItemId }, data: { quantity: { increment: m.delta } } });
  }

  const balance = new Prisma.Decimal(item.quantity).plus(m.delta);
  await client.stockMovement.create({
    data: {
      garageId: m.garageId,
      stockItemId: m.stockItemId,
      type: m.type,
      quantity: m.delta,
      balance,
      unitCost: m.unitCost ?? null,
      note: m.note ?? null,
      workOrderId: m.workOrderId ?? null,
      partId: m.partId ?? null,
      actorId: m.actorId ?? null,
    },
  });
  return { item, balance };
}
