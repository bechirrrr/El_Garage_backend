import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    customer: {
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      create: (args: any) => Promise.resolve({ id: 'customer-1', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    ...overrides,
  } as any;
}

describe('CustomersService.create', () => {
  it('rejette si le telephone est deja utilise dans le meme garage', async () => {
    const prisma = makePrismaMock({
      customer: {
        findUnique: () => Promise.resolve({ id: 'customer-existing' }),
      },
    });
    const service = new CustomersService(prisma);

    await expect(
      service.create('garage-1', { name: 'Ahmed', phone: '20123456' }),
    ).rejects.toThrow(ConflictException);
  });

  it("ne verifie pas l'unicite si aucun telephone n'est fourni", async () => {
    let findUniqueCalled = false;
    const prisma = makePrismaMock({
      customer: {
        findUnique: () => {
          findUniqueCalled = true;
          return Promise.resolve(null);
        },
        create: (args: any) => Promise.resolve({ id: 'customer-1', ...args.data }),
      },
    });
    const service = new CustomersService(prisma);

    const result = await service.create('garage-1', { name: 'Ahmed' });

    expect(findUniqueCalled).toBe(false);
    expect(result.name).toBe('Ahmed');
  });
});

describe('CustomersService.findOne', () => {
  it("rejette avec NotFoundException si le client appartient a un autre garage", async () => {
    const prisma = makePrismaMock({
      customer: {
        findUnique: () => Promise.resolve({ id: 'customer-1', garageId: 'garage-2' }),
      },
    });
    const service = new CustomersService(prisma);

    await expect(service.findOne('garage-1', 'customer-1')).rejects.toThrow(NotFoundException);
  });
});

describe('CustomersService.update', () => {
  it('rejette si le nouveau telephone appartient deja a un AUTRE client du garage', async () => {
    const prisma = makePrismaMock({
      customer: {
        findUnique: (args: any) =>
          args.where.garageId_phone
            ? Promise.resolve({ id: 'customer-2' }) // un autre client a deja ce phone
            : Promise.resolve({ id: 'customer-1', garageId: 'garage-1' }),
      },
    });
    const service = new CustomersService(prisma);

    await expect(
      service.update('garage-1', 'customer-1', { phone: '20999999' }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('CustomersService.remove', () => {
  it('traduit une violation de contrainte (P2003) en ConflictException', async () => {
    const prisma = makePrismaMock({
      customer: {
        findUnique: () => Promise.resolve({ id: 'customer-1', garageId: 'garage-1' }),
        delete: () => Promise.reject({ code: 'P2003' }),
      },
    });
    const service = new CustomersService(prisma);

    await expect(service.remove('garage-1', 'customer-1')).rejects.toThrow(ConflictException);
  });
});
