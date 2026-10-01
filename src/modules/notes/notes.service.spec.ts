import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    workOrder: {
      findUnique: () =>
        Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
    },
    note: {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'note-1', ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    ...overrides,
  } as any;
}

describe('NotesService.create -- restriction Mecanicien (Section 20)', () => {
  it("rejette si un MECHANIC ajoute une note a un ticket qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
    });
    const service = new NotesService(prisma);

    await expect(
      service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
        content: 'Injector #3 values are abnormal.',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejette si le ticket est introuvable / dans un autre garage', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(null) },
    });
    const service = new NotesService(prisma);

    await expect(
      service.create('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', {
        content: 'Injector #3 values are abnormal.',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('cree la note avec authorId derive du user courant', async () => {
    const prisma = makePrismaMock();
    const service = new NotesService(prisma);

    const result = await service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      content: 'New injector received.',
    });

    expect(result.content).toBe('New injector received.');
    expect(result.authorId).toBe('mechanic-1');
  });
});

describe('NotesService.findAllForWorkOrder', () => {
  it("inclut le nom de l'auteur (pas seulement authorId)", async () => {
    const prisma = makePrismaMock({
      note: {
        findMany: () =>
          Promise.resolve([
            {
              id: 'note-1',
              content: 'Injector #3 values are abnormal.',
              authorId: 'mechanic-1',
              author: { id: 'mechanic-1', name: 'Karim' },
            },
          ]),
      },
    });
    const service = new NotesService(prisma);

    const result = await service.findAllForWorkOrder('garage-1', 'wo-1');

    expect(result[0].author.name).toBe('Karim');
  });
});

describe('NotesService.remove', () => {
  it("rejette si la note n'appartient pas a ce ticket", async () => {
    const prisma = makePrismaMock({
      note: { findUnique: () => Promise.resolve({ id: 'note-1', workOrderId: 'wo-OTHER' }) },
    });
    const service = new NotesService(prisma);

    await expect(
      service.remove('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'note-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejette la suppression si un MECHANIC n'est pas le createur du ticket", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
      note: { findUnique: () => Promise.resolve({ id: 'note-1', workOrderId: 'wo-1' }) },
    });
    const service = new NotesService(prisma);

    await expect(
      service.remove('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', 'note-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('supprime la note quand tout est valide', async () => {
    const prisma = makePrismaMock({
      note: {
        findUnique: () => Promise.resolve({ id: 'note-1', workOrderId: 'wo-1' }),
        delete: (args: any) => Promise.resolve({ id: args.where.id }),
      },
    });
    const service = new NotesService(prisma);

    const result = await service.remove('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'note-1');

    expect(result.id).toBe('note-1');
  });
});
