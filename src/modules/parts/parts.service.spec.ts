import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PartsService } from './parts.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    workOrder: {
      findUnique: () =>
        Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
    },
    // Pas de facture par defaut : l'ajout de piece est libre.
    invoice: { findUnique: () => Promise.resolve(null) },
    part: {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'part-1', status: 'AVAILABLE', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    ...overrides,
  } as any;
}

describe('PartsService.create -- restriction Mecanicien (Section 20)', () => {
  it("rejette si un MECHANIC ajoute une piece a un ticket qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
    });
    const service = new PartsService(prisma);

    await expect(
      service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
        name: 'Injecteur #3',
        unitPrice: 480,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejette si le ticket est introuvable / dans un autre garage', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(null) },
    });
    const service = new PartsService(prisma);

    await expect(
      service.create('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', {
        name: 'Injecteur #3',
        unitPrice: 480,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('cree la piece quand tout est valide, avec le statut par defaut AVAILABLE', async () => {
    const prisma = makePrismaMock();
    const service = new PartsService(prisma);

    const result = await service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      name: 'Injecteur #3',
      unitPrice: 480,
    });

    expect(result.name).toBe('Injecteur #3');
    expect(result.status).toBe('AVAILABLE');
  });
});

describe('PartsService.update / remove', () => {
  it("rejette si la piece n'appartient pas a ce ticket", async () => {
    const prisma = makePrismaMock({
      part: { findUnique: () => Promise.resolve({ id: 'part-1', workOrderId: 'wo-OTHER' }) },
    });
    const service = new PartsService(prisma);

    await expect(
      service.update('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'part-1', {
        status: 'ORDERED' as any,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('fait avancer le statut sur la bonne piece (AVAILABLE -> ORDERED)', async () => {
    const prisma = makePrismaMock({
      part: {
        findUnique: () => Promise.resolve({ id: 'part-1', workOrderId: 'wo-1' }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new PartsService(prisma);

    const result = await service.update('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'part-1', {
      status: 'ORDERED' as any,
    });

    expect(result.status).toBe('ORDERED');
  });

  it("rejette la suppression si un MECHANIC n'est pas le createur du ticket", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
      part: { findUnique: () => Promise.resolve({ id: 'part-1', workOrderId: 'wo-1' }) },
    });
    const service = new PartsService(prisma);

    await expect(
      service.remove('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', 'part-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('PartsService.create -- facture deja encaissee', () => {
  // partsTotal deja aligne sur les pieces (mock : aucune) -> la synchro de facture ne fait rien ici.
  const paid = { invoice: { findUnique: () => Promise.resolve({ status: 'PAID', partsTotal: new Prisma.Decimal(0) }) } };
  const dto = { name: 'Filtre a huile', unitPrice: 25 };

  it("rejette l'ajout depuis l'onglet Pieces", async () => {
    const service = new PartsService(makePrismaMock(paid));
    await expect(service.create('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', dto)).rejects.toThrow(BadRequestException);
  });

  it("accepte l'ajout depuis la modification de la facture (ADMIN/FRONT_DESK), sans stocker le drapeau", async () => {
    const service = new PartsService(makePrismaMock(paid));
    const part = await service.create('garage-1', 'admin-1', 'FRONT_DESK' as any, 'wo-1', { ...dto, invoiceEdit: true });
    expect(part.name).toBe('Filtre a huile');
    expect(part).not.toHaveProperty('invoiceEdit');
  });

  it('rejette un MECHANIC meme avec invoiceEdit', async () => {
    const service = new PartsService(makePrismaMock(paid));
    await expect(
      service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', { ...dto, invoiceEdit: true }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PartsService -- la facture suit les pieces', () => {
  it("piece ajoutee apres la creation de la facture (brouillon) : Pieces HT et total sont mis a jour", async () => {
    let invoiceData: any = null;
    const base = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({
            id: 'invoice-1',
            status: 'DRAFT',
            laborPrice: new Prisma.Decimal(100),
            partsTotal: new Prisma.Decimal(0),
            vatRate: new Prisma.Decimal(0),
            stampDuty: new Prisma.Decimal(0),
            totalPrice: new Prisma.Decimal(100),
          }),
        update: (args: any) => ((invoiceData = args.data), Promise.resolve({})),
      },
      part: {
        create: (args: any) => Promise.resolve({ id: 'part-1', ...args.data }),
        findMany: () => Promise.resolve([{ quantity: new Prisma.Decimal(2), unitPrice: new Prisma.Decimal(25) }]),
      },
      activityEvent: { create: () => Promise.resolve({}) },
    });
    const prisma = { ...base, $transaction: (fn: (tx: any) => any) => fn(base) };

    await new PartsService(prisma).create('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', { name: 'Filtre', quantity: 2, unitPrice: 25 });

    expect(invoiceData.partsTotal.toFixed(3)).toBe('50.000');
    expect(invoiceData.totalPrice.toFixed(3)).toBe('150.000');
    expect(invoiceData.status).toBe('DRAFT');
  });
});
