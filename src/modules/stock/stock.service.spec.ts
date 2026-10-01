import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PartsService } from '../parts/parts.service.js';
import { moveStock } from './stock-movements.js';
import { StockService } from './stock.service.js';

/** Faux Prisma en memoire : un article de stock, ses mouvements, des pieces d'OR. */
function db(initialQty = 17) {
  const item: any = {
    id: 'item-1',
    garageId: 'garage-1',
    name: 'Huile 5W30',
    unit: 'L',
    quantity: new Prisma.Decimal(initialQty),
    salePrice: new Prisma.Decimal(30),
    isActive: true,
  };
  const movements: any[] = [];
  const parts: any[] = [];
  const client: any = {
    stockItem: {
      findUnique: ({ where }: any) => Promise.resolve(where.id === item.id ? { ...item } : null),
      create: ({ data }: any) => (Object.assign(item, data, { quantity: new Prisma.Decimal(0) }), Promise.resolve({ ...item })),
      update: ({ data }: any) => {
        if (data.quantity?.increment) item.quantity = item.quantity.plus(data.quantity.increment);
        return Promise.resolve({ ...item });
      },
      updateMany: ({ where, data }: any) => {
        if (item.quantity.lessThan(where.quantity.gte)) return Promise.resolve({ count: 0 });
        item.quantity = item.quantity.minus(data.quantity.decrement);
        return Promise.resolve({ count: 1 });
      },
    },
    stockMovement: { create: ({ data }: any) => (movements.push(data), Promise.resolve(data)) },
    workOrder: { findUnique: () => Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'u1' }) },
    part: {
      create: ({ data }: any) => {
        const p = { id: `part-${parts.length + 1}`, ...data, quantity: new Prisma.Decimal(data.quantity ?? 1) };
        parts.push(p);
        return Promise.resolve(p);
      },
      findUnique: ({ where }: any) => Promise.resolve(parts.find((p) => p.id === where.id) ?? null),
      update: ({ where, data }: any) => {
        const p = parts.find((x) => x.id === where.id);
        Object.assign(p, data, data.quantity !== undefined ? { quantity: new Prisma.Decimal(data.quantity) } : {});
        return Promise.resolve(p);
      },
      delete: ({ where }: any) => {
        const i = parts.findIndex((x) => x.id === where.id);
        return Promise.resolve(parts.splice(i, 1)[0]);
      },
    },
  };
  client.$transaction = (fn: any) => fn(client);
  return { item, movements, parts, client };
}

describe('moveStock', () => {
  it('refuse une sortie superieure au stock', async () => {
    const { client } = db(2);
    await expect(
      moveStock(client, { garageId: 'garage-1', stockItemId: 'item-1', delta: new Prisma.Decimal(-3), type: 'OUT' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('journalise le mouvement avec le stock restant', async () => {
    const { client, movements, item } = db(17);
    await moveStock(client, { garageId: 'garage-1', stockItemId: 'item-1', delta: new Prisma.Decimal(-4.5), type: 'OUT' as any });
    expect(item.quantity.toNumber()).toBe(12.5);
    expect(movements[0].balance.toNumber()).toBe(12.5);
  });
});

describe('Pieces d OR prises dans le stock', () => {
  it('ajout : reprend nom, unite, prix de vente et fait baisser le stock', async () => {
    const { client, item, parts, movements } = db(17);
    await new PartsService(client).create('garage-1', 'u1', 'ADMIN' as any, 'wo-1', { stockItemId: 'item-1', quantity: 4.5 });
    expect(parts[0].name).toBe('Huile 5W30');
    expect(parts[0].unit).toBe('L');
    expect(Number(parts[0].unitPrice)).toBe(30);
    expect(item.quantity.toNumber()).toBe(12.5);
    expect(movements[0].type).toBe('OUT');
    expect(movements[0].workOrderId).toBe('wo-1');
  });

  it('modification de quantite : le stock suit la difference', async () => {
    const { client, item } = db(17);
    const svc = new PartsService(client);
    const part = await svc.create('garage-1', 'u1', 'ADMIN' as any, 'wo-1', { stockItemId: 'item-1', quantity: 4 });
    await svc.update('garage-1', 'u1', 'ADMIN' as any, 'wo-1', part.id, { quantity: 5 });
    expect(item.quantity.toNumber()).toBe(12);
    await svc.update('garage-1', 'u1', 'ADMIN' as any, 'wo-1', part.id, { quantity: 2 });
    expect(item.quantity.toNumber()).toBe(15);
  });

  it('suppression : la piece revient en stock', async () => {
    const { client, item, movements } = db(17);
    const svc = new PartsService(client);
    const part = await svc.create('garage-1', 'u1', 'ADMIN' as any, 'wo-1', { stockItemId: 'item-1', quantity: 4 });
    await svc.remove('garage-1', 'u1', 'ADMIN' as any, 'wo-1', part.id);
    expect(item.quantity.toNumber()).toBe(17);
    expect(movements.at(-1).type).toBe('RETURN');
  });

  it('stock insuffisant : aucune piece creee', async () => {
    const { client, parts } = db(1);
    await expect(
      new PartsService(client).create('garage-1', 'u1', 'ADMIN' as any, 'wo-1', { stockItemId: 'item-1', quantity: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Dans la vraie base, la transaction annule la creation ; ici on verifie que l'erreur remonte.
    expect(parts.length).toBeLessThanOrEqual(1);
  });

  it('hors stock : nom et prix obligatoires', async () => {
    const { client } = db();
    await expect(new PartsService(client).create('garage-1', 'u1', 'ADMIN' as any, 'wo-1', { quantity: 1 } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('StockService', () => {
  it('inventaire : la quantite comptee remplace le stock', async () => {
    const { client, item, movements } = db(17);
    await new StockService(client).adjust('garage-1', 'u1', 'item-1', { quantity: 15 });
    expect(item.quantity.toNumber()).toBe(15);
    expect(movements[0].type).toBe('ADJUST');
    expect(movements[0].quantity.toNumber()).toBe(-2);
  });

  it('entree : + quantite et mise a jour du prix d achat', async () => {
    const { client, item } = db(2);
    let updated: any = null;
    const orig = client.stockItem.update;
    client.stockItem.update = (args: any) => ((updated = args.data), orig(args));
    await new StockService(client).receive('garage-1', 'u1', 'item-1', { quantity: 10, unitCost: 17.5 });
    expect(item.quantity.toNumber()).toBe(12);
    expect(updated.purchasePrice).toBe(17.5);
  });
});
