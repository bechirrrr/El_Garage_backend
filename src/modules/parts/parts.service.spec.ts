import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PartsService } from './parts.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    workOrder: {
      findUnique: () =>
        Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
    },
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
