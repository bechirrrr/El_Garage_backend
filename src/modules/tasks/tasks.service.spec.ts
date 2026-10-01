import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    workOrder: {
      findUnique: () =>
        Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
    },
    user: { findUnique: () => Promise.resolve(null) },
    task: {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'task-1', status: 'TODO', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    ...overrides,
  } as any;
}

describe('TasksService.create -- restriction Mecanicien (Section 20)', () => {
  it("rejette si un MECHANIC ajoute une tache a un ticket qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
    });
    const service = new TasksService(prisma);

    await expect(
      service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', { label: 'Vidange' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejette si assignedMechanicId ne correspond pas a un MECHANIC du garage", async () => {
    const prisma = makePrismaMock({
      user: { findUnique: () => Promise.resolve({ id: 'u-2', garageId: 'garage-1', role: 'FRONT_DESK' }) },
    });
    const service = new TasksService(prisma);

    await expect(
      service.create('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', {
        label: 'Vidange',
        assignedMechanicId: 'u-2',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cree la tache quand tout est valide', async () => {
    const prisma = makePrismaMock();
    const service = new TasksService(prisma);

    const result = await service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      label: 'Vidange',
    });

    expect(result.label).toBe('Vidange');
    expect(result.status).toBe('TODO');
  });
});

describe('TasksService.update / remove', () => {
  it("rejette si la tache n'appartient pas a ce ticket", async () => {
    const prisma = makePrismaMock({
      task: { findUnique: () => Promise.resolve({ id: 'task-1', workOrderId: 'wo-OTHER' }) },
    });
    const service = new TasksService(prisma);

    await expect(
      service.update('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'task-1', { status: 'DONE' as any }),
    ).rejects.toThrow(NotFoundException);
  });

  it('met a jour le statut sur la bonne tache', async () => {
    const prisma = makePrismaMock({
      task: {
        findUnique: () => Promise.resolve({ id: 'task-1', workOrderId: 'wo-1' }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new TasksService(prisma);

    const result = await service.update('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'task-1', {
      status: 'DONE' as any,
    });

    expect(result.status).toBe('DONE');
  });
});
