import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    customer: {
      findUnique: () => Promise.resolve({ id: 'customer-1', garageId: 'garage-1' }),
    },
    vehicle: {
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      create: (args: any) => Promise.resolve({ id: 'vehicle-1', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    ...overrides,
  } as any;
}

const baseDto = { customerId: 'customer-1', make: 'BMW', model: '320i', plate: '123TUN456' };

describe('VehiclesService.create', () => {
  it("rejette si le client n'existe pas ou appartient a un autre garage", async () => {
    const prisma = makePrismaMock({
      customer: { findUnique: () => Promise.resolve({ id: 'customer-1', garageId: 'garage-2' }) },
    });
    const service = new VehiclesService(prisma);

    await expect(service.create('garage-1', 'user-1', baseDto)).rejects.toThrow(NotFoundException);
  });

  it('rejette si la plaque existe deja dans le garage', async () => {
    const prisma = makePrismaMock({
      vehicle: { findUnique: () => Promise.resolve({ id: 'vehicle-existing' }) },
    });
    const service = new VehiclesService(prisma);

    await expect(service.create('garage-1', 'user-1', baseDto)).rejects.toThrow(ConflictException);
  });

  it('rejette si le VIN est deja associe a un autre vehicule', async () => {
    const prisma = makePrismaMock({
      vehicle: {
        // 1er appel (plate) -> pas de doublon, 2e appel (vin) -> doublon
        findUnique: (() => {
          let calls = 0;
          return () => {
            calls += 1;
            return Promise.resolve(calls === 2 ? { id: 'vehicle-other' } : null);
          };
        })(),
        create: (args: any) => Promise.resolve({ id: 'vehicle-1', ...args.data }),
      },
    });
    const service = new VehiclesService(prisma);

    await expect(
      service.create('garage-1', 'user-1', { ...baseDto, vin: 'VIN123' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('VehiclesService.update -- restriction Mecanicien (Section 20)', () => {
  it("rejette avec ForbiddenException si un MECHANIC modifie un vehicule qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      vehicle: {
        findUnique: () =>
          Promise.resolve({ id: 'vehicle-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
    });
    const service = new VehiclesService(prisma);

    await expect(
      service.update('garage-1', 'mechanic-1', 'MECHANIC' as any, 'vehicle-1', { mileage: 5000 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('autorise un MECHANIC a modifier un vehicule qu\'il a lui-meme cree', async () => {
    const prisma = makePrismaMock({
      vehicle: {
        findUnique: () =>
          Promise.resolve({ id: 'vehicle-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new VehiclesService(prisma);

    const result = await service.update(
      'garage-1',
      'mechanic-1',
      'MECHANIC' as any,
      'vehicle-1',
      { mileage: 5000 },
    );

    expect(result.mileage).toBe(5000);
  });

  it('autorise un ADMIN a modifier un vehicule cree par quelqu\'un d\'autre', async () => {
    const prisma = makePrismaMock({
      vehicle: {
        findUnique: () =>
          Promise.resolve({ id: 'vehicle-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new VehiclesService(prisma);

    const result = await service.update('garage-1', 'admin-1', 'ADMIN' as any, 'vehicle-1', {
      mileage: 7000,
    });

    expect(result.mileage).toBe(7000);
  });
});

describe('VehiclesService.remove', () => {
  it('traduit une violation de contrainte (P2003) en ConflictException', async () => {
    const prisma = makePrismaMock({
      vehicle: {
        findUnique: () => Promise.resolve({ id: 'vehicle-1', garageId: 'garage-1' }),
        delete: () => Promise.reject({ code: 'P2003' }),
      },
    });
    const service = new VehiclesService(prisma);

    await expect(service.remove('garage-1', 'vehicle-1')).rejects.toThrow(ConflictException);
  });
});
