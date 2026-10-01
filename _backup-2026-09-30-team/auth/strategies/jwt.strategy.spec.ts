import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';

// passport-jwt exige un secret des la construction de la strategie (avant
// meme le premier appel a validate()) -- non fourni par un .env en test
// (vitest ne passe pas par main.ts / dotenv/config). Valeur arbitraire :
// aucun token n'est reellement verifie ici, seul validate() est teste.
process.env.JWT_SECRET ??= 'test-secret';

/**
 * Meme approche que auth.service.spec.ts : on mock PrismaService a la main
 * (une seule methode utilisee, user.findUnique) plutot que de monter un
 * vrai module NestJS avec une vraie base.
 */
function makeStrategy(userInDb: any) {
  const prisma = {
    user: {
      findUnique: () => Promise.resolve(userInDb),
    },
  } as any;

  return new JwtStrategy(prisma);
}

const payload = { sub: 'user-1', garageId: 'garage-1', role: 'ADMIN' as const };

describe('JwtStrategy.validate', () => {
  it('accepte un utilisateur actif dont le Garage est ACTIVE', async () => {
    const strategy = makeStrategy({
      id: 'user-1',
      garageId: 'garage-1',
      role: 'ADMIN',
      isActive: true,
      garage: { status: 'ACTIVE' },
    });

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      garageId: 'garage-1',
      role: 'ADMIN',
    });
  });

  it('rejette si le Garage vient d\'etre SUSPENDED -- meme avec un JWT encore valide', async () => {
    const strategy = makeStrategy({
      id: 'user-1',
      garageId: 'garage-1',
      role: 'ADMIN',
      isActive: true,
      garage: { status: 'SUSPENDED' },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejette si le Garage est REJECTED', async () => {
    const strategy = makeStrategy({
      id: 'user-1',
      garageId: 'garage-1',
      role: 'ADMIN',
      isActive: true,
      garage: { status: 'REJECTED' },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('rejette si le Garage est toujours PENDING_APPROVAL', async () => {
    const strategy = makeStrategy({
      id: 'user-1',
      garageId: 'garage-1',
      role: 'ADMIN',
      isActive: true,
      garage: { status: 'PENDING_APPROVAL' },
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it("rejette si le compte a ete desactive (isActive = false)", async () => {
    const strategy = makeStrategy({
      id: 'user-1',
      garageId: 'garage-1',
      role: 'MECHANIC',
      isActive: false,
      garage: { status: 'ACTIVE' },
    });

    await expect(
      strategy.validate({ ...payload, role: 'MECHANIC' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejette si l'utilisateur n'existe plus en base", async () => {
    const strategy = makeStrategy(null);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it("accepte un OWNER (garageId null) sans jamais regarder de Garage", async () => {
    const strategy = makeStrategy({
      id: 'owner-1',
      garageId: null,
      role: 'OWNER',
      isActive: true,
      garage: null,
    });

    await expect(
      strategy.validate({ sub: 'owner-1', garageId: null, role: 'OWNER' }),
    ).resolves.toEqual({ id: 'owner-1', garageId: null, role: 'OWNER' });
  });
});
