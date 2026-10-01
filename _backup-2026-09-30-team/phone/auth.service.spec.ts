import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';

/**
 * On mock PrismaService et JwtService a la main plutot que de monter un
 * vrai module NestJS avec une vraie connexion Postgres : AuthService.login
 * n'a besoin que de deux methodes (prisma.user.findUnique, jwtService.sign)
 * pour etre teste entierement, et ca reste rapide + independant de toute
 * base de donnees.
 */
function makeService(userInDb: any) {
  const prisma = {
    user: {
      findUnique: () => Promise.resolve(userInDb),
    },
  } as any;
  const jwtService = {
    sign: (payload: unknown) => `signed(${JSON.stringify(payload)})`,
  } as any;

  return new AuthService(prisma, jwtService);
}

describe('AuthService.login', () => {
  it('renvoie un accessToken + le status du garage si email/mot de passe corrects', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4); // 4 rounds : juste pour le test, rapide
    const service = makeService({
      id: 'user-1',
      email: 'admin@garage.tn',
      passwordHash,
      isActive: true,
      garageId: 'garage-1',
      role: 'ADMIN',
      garage: { status: 'PENDING_APPROVAL' },
    });

    const result = await service.login({ email: 'admin@garage.tn', password: 'correct-password' });

    expect(result.accessToken).toContain('user-1');
    expect(result.garageStatus).toBe('PENDING_APPROVAL');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect((result.user as any).garage).toBeUndefined();
  });

  it('rejette si le mot de passe est incorrect', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const service = makeService({
      id: 'user-1',
      passwordHash,
      isActive: true,
      garageId: 'garage-1',
      role: 'ADMIN',
      garage: null,
    });

    await expect(
      service.login({ email: 'admin@garage.tn', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejette si l'email n'existe pas (meme message que mot de passe incorrect)", async () => {
    const service = makeService(null);

    await expect(
      service.login({ email: 'inconnu@garage.tn', password: 'peu-importe' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejette si le compte est desactive (isActive = false)', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const service = makeService({
      id: 'user-1',
      passwordHash,
      isActive: false,
      garageId: 'garage-1',
      role: 'MECHANIC',
      garage: null,
    });

    await expect(
      service.login({ email: 'meca@garage.tn', password: 'correct-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
