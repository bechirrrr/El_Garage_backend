import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PhotosService } from './photos.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    workOrder: {
      findUnique: () =>
        Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'mechanic-1' }),
    },
    photo: {
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'photo-1', ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    ...overrides,
  } as any;
}

describe('PhotosService.create -- restriction Mecanicien (Section 20)', () => {
  it("rejette si un MECHANIC ajoute une photo a un ticket qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
    });
    const service = new PhotosService(prisma);

    await expect(
      service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
        url: 'https://storage.example.com/before.jpg',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejette si le ticket est introuvable / dans un autre garage', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(null) },
    });
    const service = new PhotosService(prisma);

    await expect(
      service.create('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', {
        url: 'https://storage.example.com/before.jpg',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('cree la photo avec uploadedById derive du user courant', async () => {
    const prisma = makePrismaMock();
    const service = new PhotosService(prisma);

    const result = await service.create('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      url: 'https://storage.example.com/before.jpg',
      stage: 'BEFORE' as any,
    });

    expect(result.url).toBe('https://storage.example.com/before.jpg');
    expect(result.uploadedById).toBe('mechanic-1');
  });
});

describe('PhotosService.remove', () => {
  it("rejette si la photo n'appartient pas a ce ticket", async () => {
    const prisma = makePrismaMock({
      photo: { findUnique: () => Promise.resolve({ id: 'photo-1', workOrderId: 'wo-OTHER' }) },
    });
    const service = new PhotosService(prisma);

    await expect(
      service.remove('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'photo-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejette la suppression si un MECHANIC n'est pas le createur du ticket", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
      photo: { findUnique: () => Promise.resolve({ id: 'photo-1', workOrderId: 'wo-1' }) },
    });
    const service = new PhotosService(prisma);

    await expect(
      service.remove('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', 'photo-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('supprime la photo quand tout est valide', async () => {
    const prisma = makePrismaMock({
      photo: {
        findUnique: () => Promise.resolve({ id: 'photo-1', workOrderId: 'wo-1' }),
        delete: (args: any) => Promise.resolve({ id: args.where.id }),
      },
    });
    const service = new PhotosService(prisma);

    const result = await service.remove('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'photo-1');

    expect(result.id).toBe('photo-1');
  });
});
