import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InvitationsService } from './invitations.service.js';

const mailService = { sendInvitationEmail: () => Promise.resolve() } as any;

function makePrismaMock(overrides: Record<string, any> = {}) {
  return {
    user: { findUnique: () => Promise.resolve(null) },
    invitation: {
      findUnique: () => Promise.resolve(null),
      upsert: (args: any) => Promise.resolve({ id: 'invitation-1', ...args.create }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      findMany: () => Promise.resolve([]),
    },
    garage: { findUnique: () => Promise.resolve({ name: 'Speedy Auto' }) },
    $transaction: (fn: (tx: any) => any) => fn(makePrismaMock()),
    ...overrides,
  } as any;
}

describe('InvitationsService.create', () => {
  it("rejette si un User existe deja avec cet email", async () => {
    const prisma = makePrismaMock({
      user: { findUnique: () => Promise.resolve({ id: 'user-1' }) },
    });
    const service = new InvitationsService(prisma, mailService);

    await expect(
      service.create('garage-1', 'admin-1', {
        email: 'meca@garage.tn',
        name: 'Karim',
        role: 'MECHANIC',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejette si une invitation PENDING existe deja pour cet email', async () => {
    const prisma = makePrismaMock({
      invitation: {
        findUnique: () => Promise.resolve({ status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000) }),
        upsert: () => Promise.resolve({}),
      },
    });
    const service = new InvitationsService(prisma, mailService);

    await expect(
      service.create('garage-1', 'admin-1', {
        email: 'meca@garage.tn',
        name: 'Karim',
        role: 'MECHANIC',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('reactive (upsert) une invitation REVOKED precedente pour le meme email', async () => {
    const prisma = makePrismaMock({
      invitation: {
        findUnique: () => Promise.resolve({ status: 'REVOKED' }),
        upsert: (args: any) => Promise.resolve({ id: 'invitation-1', status: 'PENDING', ...args.create }),
      },
    });
    const service = new InvitationsService(prisma, mailService);

    const result = await service.create('garage-1', 'admin-1', {
      email: 'meca@garage.tn',
      name: 'Karim',
      role: 'MECHANIC',
    });

    expect(result.status).toBe('PENDING');
  });
});

describe('InvitationsService.revoke', () => {
  it("rejette avec NotFoundException si l'invitation appartient a un autre garage", async () => {
    const prisma = makePrismaMock({
      invitation: {
        findUnique: () => Promise.resolve({ id: 'invitation-1', garageId: 'garage-2', status: 'PENDING' }),
      },
    });
    const service = new InvitationsService(prisma, mailService);

    await expect(service.revoke('garage-1', 'invitation-1')).rejects.toThrow(NotFoundException);
  });

  it("rejette si l'invitation n'est plus PENDING", async () => {
    const prisma = makePrismaMock({
      invitation: {
        findUnique: () =>
          Promise.resolve({ id: 'invitation-1', garageId: 'garage-1', status: 'ACCEPTED' }),
      },
    });
    const service = new InvitationsService(prisma, mailService);

    await expect(service.revoke('garage-1', 'invitation-1')).rejects.toThrow(BadRequestException);
  });
});

describe('InvitationsService.accept (via findValidPendingInvitation)', () => {
  it('rejette et marque EXPIRED si la date est depassee', async () => {
    const updateCalls: any[] = [];
    const prisma = makePrismaMock({
      invitation: {
        findUnique: () =>
          Promise.resolve({
            id: 'invitation-1',
            status: 'PENDING',
            expiresAt: new Date(Date.now() - 1000), // deja expiree
          }),
        update: (args: any) => {
          updateCalls.push(args);
          return Promise.resolve({});
        },
      },
    });
    const service = new InvitationsService(prisma, mailService);

    await expect(service.accept('some-token', { password: 'password123' })).rejects.toThrow(
      BadRequestException,
    );
    expect(updateCalls[0].data.status).toBe('EXPIRED');
  });

  it('rejette si le token ne correspond a aucune invitation', async () => {
    const service = new InvitationsService(makePrismaMock(), mailService);

    await expect(service.accept('invalid-token', { password: 'password123' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
