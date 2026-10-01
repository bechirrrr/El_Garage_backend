import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service.js';

/** Meme approche que auth.service.spec.ts : PrismaService mocke a la main. */
function makeService(overrides: { userByEmail?: any; invitation?: any; member?: any } = {}) {
  const created: any[] = [];
  const updated: any[] = [];
  const prisma = {
    user: {
      findUnique: ({ where }: any) =>
        Promise.resolve(where.email !== undefined ? (overrides.userByEmail ?? null) : (overrides.member ?? null)),
      create: ({ data }: any) => {
        created.push(data);
        return Promise.resolve({ id: 'new-user', ...data });
      },
      update: ({ data }: any) => {
        updated.push(data);
        return Promise.resolve({ id: overrides.member?.id, ...data });
      },
    },
    invitation: {
      findUnique: () => Promise.resolve(overrides.invitation ?? null),
    },
  } as any;
  return { service: new UsersService(prisma), created, updated };
}

const dto = { email: 'anis@garage.tn', name: 'Anis', role: 'MECHANIC' as const, password: 'Provisoire-123' };

describe('UsersService.create', () => {
  it('cree un compte actif avec mot de passe hache et mustChangePassword = true', async () => {
    const { service, created } = makeService();
    await service.create('garage-1', dto);

    expect(created).toHaveLength(1);
    expect(created[0].garageId).toBe('garage-1');
    expect(created[0].mustChangePassword).toBe(true);
    expect(created[0].passwordHash).not.toBe(dto.password);
    expect(await bcrypt.compare(dto.password, created[0].passwordHash)).toBe(true);
  });

  it("refuse si un compte existe deja avec cet email", async () => {
    const { service } = makeService({ userByEmail: { id: 'x' } });
    await expect(service.create('garage-1', dto)).rejects.toThrow(ConflictException);
  });

  it('refuse si une invitation est en attente pour cet email', async () => {
    const { service } = makeService({
      invitation: { status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await expect(service.create('garage-1', dto)).rejects.toThrow(ConflictException);
  });

  it('accepte si la seule invitation a expire', async () => {
    const { service, created } = makeService({
      invitation: { status: 'PENDING', expiresAt: new Date(Date.now() - 1000) },
    });
    await service.create('garage-1', dto);
    expect(created).toHaveLength(1);
  });
});

describe('UsersService.update', () => {
  const mechanic = { id: 'm-1', garageId: 'garage-1', role: 'MECHANIC' };

  it('change le role et desactive un mecanicien du garage', async () => {
    const { service, updated } = makeService({ member: mechanic });
    await service.update('garage-1', 'admin-1', 'm-1', { role: 'FRONT_DESK', isActive: false });
    expect(updated[0]).toEqual({ role: 'FRONT_DESK', isActive: false });
  });

  it("refuse de modifier son propre compte", async () => {
    const { service } = makeService({ member: { ...mechanic, id: 'admin-1' } });
    await expect(service.update('garage-1', 'admin-1', 'admin-1', { isActive: false })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("refuse de modifier un autre administrateur", async () => {
    const { service } = makeService({ member: { ...mechanic, role: 'ADMIN' } });
    await expect(service.update('garage-1', 'admin-1', 'm-1', { isActive: false })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("traite un membre d'un autre garage comme introuvable", async () => {
    const { service } = makeService({ member: { ...mechanic, garageId: 'garage-2' } });
    await expect(service.update('garage-1', 'admin-1', 'm-1', { isActive: false })).rejects.toThrow(
      NotFoundException,
    );
  });
});
