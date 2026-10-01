import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    customer: {
      findUnique: () => Promise.resolve({ id: 'customer-1', garageId: 'garage-1' }),
    },
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
    user: {
      findUnique: () =>
        Promise.resolve({ id: 'mechanic-1', garageId: 'garage-1', role: 'MECHANIC' }),
    },
    reservation: {
      findUnique: () =>
        Promise.resolve({
          id: 'res-1',
          garageId: 'garage-1',
          status: 'PENDING',
          vehicleId: 'vehicle-1',
          assignedMechanicId: null,
          reason: 'Vidange',
          scheduledAt: new Date('2026-09-20T08:00:00Z'),
          durationMinutes: 45,
        }),
      findMany: () => Promise.resolve([]),
      create: (args: any) => Promise.resolve({ id: 'res-1', status: 'PENDING', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
    },
    workOrder: {
      create: (args: any) => Promise.resolve({ id: 'wo-1', ...args.data }),
    },
    activityEvent: { create: () => Promise.resolve({}) },
    // Compteur de numeros d'OR (nextWorkOrderNumber) : renvoie toujours 42 dans les tests.
    garage: { update: () => Promise.resolve({ workOrderCounter: 42 }) },
    ...overrides,
  };
  return {
    ...base,
    $transaction: (fn: (tx: any) => any) => fn(base),
  } as any;
}

const baseDto = { customerId: 'customer-1', scheduledAt: '2026-09-20T08:00:00Z', reason: 'Vidange' };

describe('ReservationsService.create', () => {
  it("rejette si le client n'existe pas dans ce garage", async () => {
    const prisma = makePrismaMock({ customer: { findUnique: () => Promise.resolve(null) } });
    const service = new ReservationsService(prisma);

    await expect(service.create('garage-1', 'admin-1', baseDto)).rejects.toThrow(NotFoundException);
  });

  it("rejette si assignedMechanicId ne pointe pas vers un MECHANIC du meme garage", async () => {
    const prisma = makePrismaMock({
      user: { findUnique: () => Promise.resolve({ id: 'x', garageId: 'garage-1', role: 'FRONT_DESK' }) },
    });
    const service = new ReservationsService(prisma);

    await expect(
      service.create('garage-1', 'admin-1', { ...baseDto, assignedMechanicId: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cree la reservation en PENDING', async () => {
    const prisma = makePrismaMock();
    const service = new ReservationsService(prisma);

    const result = await service.create('garage-1', 'admin-1', baseDto);

    expect(result.status).toBe('PENDING');
    expect(result.createdById).toBe('admin-1');
  });
});

describe('ReservationsService visibilite Mecanicien (Section 33)', () => {
  it("rejette findOne si un MECHANIC consulte un rendez-vous qui n'est pas le sien", async () => {
    const prisma = makePrismaMock({
      reservation: {
        findUnique: () =>
          Promise.resolve({ id: 'res-1', garageId: 'garage-1', assignedMechanicId: 'other-mechanic' }),
      },
    });
    const service = new ReservationsService(prisma);

    await expect(
      service.findOne('garage-1', 'mechanic-1', 'MECHANIC' as any, 'res-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('filtre findAllForGarage sur assignedMechanicId pour un MECHANIC', async () => {
    const calls: any[] = [];
    const prisma = makePrismaMock({
      reservation: {
        findMany: (args: any) => {
          calls.push(args);
          return Promise.resolve([]);
        },
      },
    });
    const service = new ReservationsService(prisma);

    await service.findAllForGarage('garage-1', 'mechanic-1', 'MECHANIC' as any);

    expect(calls[0].where.assignedMechanicId).toBe('mechanic-1');
  });

  it("n'ajoute aucun filtre assignedMechanicId pour ADMIN/FRONT_DESK", async () => {
    const calls: any[] = [];
    const prisma = makePrismaMock({
      reservation: {
        findMany: (args: any) => {
          calls.push(args);
          return Promise.resolve([]);
        },
      },
    });
    const service = new ReservationsService(prisma);

    await service.findAllForGarage('garage-1', 'admin-1', 'ADMIN' as any);

    expect(calls[0].where.assignedMechanicId).toBeUndefined();
  });
});

describe('ReservationsService.updateStatus', () => {
  it('rejette une transition depuis un etat final (CANCELLED)', async () => {
    const prisma = makePrismaMock({
      reservation: { findUnique: () => Promise.resolve({ id: 'res-1', garageId: 'garage-1', status: 'CANCELLED' }) },
    });
    const service = new ReservationsService(prisma);

    await expect(
      service.updateStatus('garage-1', 'res-1', { status: 'CONFIRMED' as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('autorise PENDING -> CONFIRMED', async () => {
    const prisma = makePrismaMock();
    const service = new ReservationsService(prisma);

    const result = await service.updateStatus('garage-1', 'res-1', { status: 'CONFIRMED' as any });

    expect(result.status).toBe('CONFIRMED');
  });
});

describe('ReservationsService.convert', () => {
  it('rejette si ni la reservation ni le DTO ne fournissent de vehicleId', async () => {
    const prisma = makePrismaMock({
      reservation: {
        findUnique: () =>
          Promise.resolve({ id: 'res-1', garageId: 'garage-1', status: 'PENDING', vehicleId: null }),
      },
    });
    const service = new ReservationsService(prisma);

    await expect(service.convert('garage-1', 'admin-1', 'res-1', {})).rejects.toThrow(BadRequestException);
  });

  it('rejette si la reservation est deja CONVERTED', async () => {
    const prisma = makePrismaMock({
      reservation: {
        findUnique: () => Promise.resolve({ id: 'res-1', garageId: 'garage-1', status: 'CONVERTED' }),
      },
    });
    const service = new ReservationsService(prisma);

    await expect(service.convert('garage-1', 'admin-1', 'res-1', {})).rejects.toThrow(BadRequestException);
  });

  it('cree le WorkOrder et marque la reservation CONVERTED avec convertedWorkOrderId', async () => {
    const events: any[] = [];
    const prisma = makePrismaMock({
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new ReservationsService(prisma);

    const result = await service.convert('garage-1', 'admin-1', 'res-1', {});

    expect(result.workOrder.customerId).toBe('customer-1');
    expect(result.workOrder.problemReported).toBe('Vidange');
    expect(result.reservation.status).toBe('CONVERTED');
    expect(result.reservation.convertedWorkOrderId).toBe('wo-1');
    expect(events[0].type).toBe('WORK_ORDER_CREATED');
  });

  it('le ticket reprend le creneau du RDV (scheduledAt + duree)', async () => {
    const service = new ReservationsService(makePrismaMock());

    const result = await service.convert('garage-1', 'admin-1', 'res-1', {});

    expect(result.workOrder.scheduledAt).toEqual(new Date('2026-09-20T08:00:00Z'));
    expect(result.workOrder.estimatedMinutes).toBe(45);
  });
});
