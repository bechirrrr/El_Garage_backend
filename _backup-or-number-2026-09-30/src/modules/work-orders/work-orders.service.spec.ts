import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    vehicle: {
      findUnique: () =>
        Promise.resolve({
          id: 'vehicle-1',
          garageId: 'garage-1',
          customerId: 'customer-1',
          make: 'BMW',
          model: '320i',
          plate: '123TUN456',
        }),
    },
    workOrder: {
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      create: (args: any) => Promise.resolve({ id: 'wo-1', status: 'RECEIVED', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
    },
    activityEvent: { create: () => Promise.resolve({}) },
    user: { findUnique: () => Promise.resolve(null) },
    ...overrides,
  };
  return {
    ...base,
    $transaction: (fn: (tx: any) => any) => fn(base),
  } as any;
}

const baseDto = { vehicleId: 'vehicle-1', problemReported: 'Vibration moteur' };

describe('WorkOrdersService.create', () => {
  it("rejette si le vehicule n'existe pas ou appartient a un autre garage", async () => {
    const prisma = makePrismaMock({
      vehicle: { findUnique: () => Promise.resolve({ id: 'vehicle-1', garageId: 'garage-2' }) },
    });
    const service = new WorkOrdersService(prisma);

    await expect(service.create('garage-1', 'user-1', baseDto)).rejects.toThrow(NotFoundException);
  });

  it('fige customerId depuis le vehicule (jamais fourni par le client)', async () => {
    const prisma = makePrismaMock();
    const service = new WorkOrdersService(prisma);

    const result = await service.create('garage-1', 'user-1', baseDto);

    expect(result.customerId).toBe('customer-1');
  });

  it('walk-in sans creneau : scheduledAt = maintenant (le ticket apparait sur le calendrier)', async () => {
    const service = new WorkOrdersService(makePrismaMock());
    const before = Date.now();

    const result = await service.create('garage-1', 'user-1', baseDto);

    expect(result.scheduledAt).toBeInstanceOf(Date);
    expect(result.scheduledAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('creneau fourni : scheduledAt/estimatedMinutes repris tels quels', async () => {
    const service = new WorkOrdersService(makePrismaMock());

    const result = await service.create('garage-1', 'user-1', {
      ...baseDto,
      scheduledAt: '2026-10-01T08:30:00.000Z',
      estimatedMinutes: 90,
    });

    expect(result.scheduledAt.toISOString()).toBe('2026-10-01T08:30:00.000Z');
    expect(result.estimatedMinutes).toBe(90);
  });
});

describe('WorkOrdersService.update -- replanification depuis le calendrier', () => {
  const existing = {
    id: 'wo-1',
    garageId: 'garage-1',
    createdById: 'admin-1',
    status: 'RECEIVED',
    scheduledAt: new Date('2026-10-01T08:00:00.000Z'),
    estimatedMinutes: 60,
  };

  function run(dto: Record<string, unknown>) {
    const events: any[] = [];
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () => Promise.resolve(existing),
        update: (args: any) => Promise.resolve({ ...existing, ...args.data }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new WorkOrdersService(prisma);
    return service.update('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', dto).then((updated) => ({ updated, events }));
  }

  it('un deplacement seul journalise WORK_ORDER_RESCHEDULED avec ancien/nouveau creneau', async () => {
    const { updated, events } = await run({ scheduledAt: '2026-10-02T10:00:00.000Z' });

    expect(updated.scheduledAt).toEqual(new Date('2026-10-02T10:00:00.000Z'));
    expect(events[0].type).toBe('WORK_ORDER_RESCHEDULED');
    expect(events[0].metadata.old.scheduledAt).toEqual(existing.scheduledAt);
  });

  it('une modification de contenu reste un WORK_ORDER_UPDATED generique', async () => {
    const { events } = await run({ mileage: 150000 });

    expect(events[0].type).toBe('WORK_ORDER_UPDATED');
  });
});

describe('WorkOrdersService.update -- restriction Mecanicien (Section 20)', () => {
  it("rejette avec ForbiddenException si un MECHANIC modifie le contenu d'un ticket qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic', status: 'RECEIVED' }),
      },
    });
    const service = new WorkOrdersService(prisma);

    await expect(
      service.update('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', { mileage: 5000 }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe("WorkOrdersService.updateStatus -- un MECHANIC ne peut changer que le statut du ticket qui lui est ASSIGNE", () => {
  it('autorise le mecanicien assigne a changer le statut et journalise un ActivityEvent SENSITIVE', async () => {
    const events: any[] = [];
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({
            id: 'wo-1',
            garageId: 'garage-1',
            createdById: 'admin-1',
            assignedMechanicId: 'mechanic-1',
            status: 'RECEIVED',
          }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new WorkOrdersService(prisma);

    const result = await service.updateStatus('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      status: 'DIAGNOSIS' as any,
    });

    expect(result.status).toBe('DIAGNOSIS');
    expect(events[0].category).toBe('SENSITIVE');
    expect(events[0].type).toBe('STATUS_CHANGED');
  });

  it("rejette un MECHANIC qui a cree le ticket mais n'a pas encore ete assigne dessus", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({
            id: 'wo-1',
            garageId: 'garage-1',
            createdById: 'mechanic-1',
            assignedMechanicId: null,
            status: 'RECEIVED',
          }),
      },
    });
    const service = new WorkOrdersService(prisma);

    await expect(
      service.updateStatus('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
        status: 'DIAGNOSIS' as any,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejette un MECHANIC assigne a un autre ticket', async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({
            id: 'wo-1',
            garageId: 'garage-1',
            createdById: 'admin-1',
            assignedMechanicId: 'other-mechanic',
            status: 'RECEIVED',
          }),
      },
    });
    const service = new WorkOrdersService(prisma);

    await expect(
      service.updateStatus('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
        status: 'DIAGNOSIS' as any,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("n'impose aucune restriction d'assignation a ADMIN/FRONT_DESK", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({
            id: 'wo-1',
            garageId: 'garage-1',
            createdById: 'front-desk-1',
            assignedMechanicId: null,
            status: 'RECEIVED',
          }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new WorkOrdersService(prisma);

    const result = await service.updateStatus('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', {
      status: 'DIAGNOSIS' as any,
    });

    expect(result.status).toBe('DIAGNOSIS');
  });
});

describe("WorkOrdersService.findOne -- visibilite de l'Audit Log (Section 30bis)", () => {
  function makeWorkOrderWithEvents() {
    return {
      id: 'wo-1',
      garageId: 'garage-1',
      vehicle: {},
      customer: {},
      createdBy: {},
      assignedMechanic: null,
      diagnosis: null,
      invoice: null,
      _count: { tasks: 0, parts: 0, photos: 0, notes: 0 },
      activityEvents: [
        { id: 'evt-general', category: 'GENERAL', actorId: 'mechanic-1', message: 'Diagnostic demarre' },
        { id: 'evt-sensitive-front-desk', category: 'SENSITIVE', actorId: 'front-desk-1', message: 'total_price: 850 -> 950' },
        { id: 'evt-sensitive-admin', category: 'SENSITIVE', actorId: 'admin-1', message: 'status: DIAGNOSIS -> REPAIR' },
      ],
    };
  }

  it('renvoie tous les evenements (GENERAL + SENSITIVE) a un ADMIN', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(makeWorkOrderWithEvents()) },
    });
    const service = new WorkOrdersService(prisma);

    const result = await service.findOne('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1');

    expect(result.activityEvents.map((e: any) => e.id)).toEqual([
      'evt-general',
      'evt-sensitive-front-desk',
      'evt-sensitive-admin',
    ]);
  });

  it('ne renvoie a un FRONT_DESK que les SENSITIVE dont il est lui-meme l\'auteur', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(makeWorkOrderWithEvents()) },
    });
    const service = new WorkOrdersService(prisma);

    const result = await service.findOne('garage-1', 'front-desk-1', 'FRONT_DESK' as any, 'wo-1');

    expect(result.activityEvents.map((e: any) => e.id)).toEqual(['evt-general', 'evt-sensitive-front-desk']);
  });

  it('ne renvoie jamais de SENSITIVE a un MECHANIC, meme si un evenement lui appartient', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(makeWorkOrderWithEvents()) },
    });
    const service = new WorkOrdersService(prisma);

    const result = await service.findOne('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1');

    expect(result.activityEvents.map((e: any) => e.id)).toEqual(['evt-general']);
  });
});

describe('WorkOrdersService.assign', () => {
  it("rejette si l'utilisateur cible n'a pas le role MECHANIC", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () => Promise.resolve({ id: 'wo-1', garageId: 'garage-1', assignedMechanicId: null }),
      },
      user: {
        findUnique: () => Promise.resolve({ id: 'user-2', garageId: 'garage-1', role: 'FRONT_DESK' }),
      },
    });
    const service = new WorkOrdersService(prisma);

    await expect(
      service.assign('garage-1', 'admin-1', 'wo-1', { assignedMechanicId: 'user-2' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('assigne un mecanicien valide du meme garage et journalise un ActivityEvent SENSITIVE', async () => {
    const events: any[] = [];
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () => Promise.resolve({ id: 'wo-1', garageId: 'garage-1', assignedMechanicId: null }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
      user: {
        findUnique: () =>
          Promise.resolve({ id: 'mechanic-1', garageId: 'garage-1', role: 'MECHANIC', name: 'Karim' }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new WorkOrdersService(prisma);

    const result = await service.assign('garage-1', 'admin-1', 'wo-1', {
      assignedMechanicId: 'mechanic-1',
    });

    expect(result.assignedMechanicId).toBe('mechanic-1');
    expect(events[0].category).toBe('SENSITIVE');
    expect(events[0].type).toBe('MECHANIC_ASSIGNED');
  });
});
