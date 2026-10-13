import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * On ne reteste pas Passport (verification du token) : la methode
 * canActivate du parent AuthGuard('jwt') est remplacee par un stub qui
 * "authentifie" et pose req.user. Seule la regle mustChangePassword est
 * testee ici.
 */
function makeContext(user: unknown): ExecutionContext {
  const request = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(allowTemporaryPassword: boolean | undefined) {
  const reflector = { getAllAndOverride: () => allowTemporaryPassword } as unknown as Reflector;
  return new JwtAuthGuard(reflector);
}

const parentProto = Object.getPrototypeOf(JwtAuthGuard.prototype);

describe('JwtAuthGuard -- mot de passe provisoire', () => {
  beforeEach(() => {
    vi.spyOn(parentProto, 'canActivate').mockResolvedValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('laisse passer un utilisateur normal sur une route quelconque', async () => {
    const guard = makeGuard(undefined);
    await expect(guard.canActivate(makeContext({ id: 'u-1', mustChangePassword: false }))).resolves.toBe(true);
  });

  it('bloque (403) un mot de passe provisoire sur une route metier', async () => {
    const guard = makeGuard(undefined);
    await expect(guard.canActivate(makeContext({ id: 'u-1', mustChangePassword: true }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('autorise un mot de passe provisoire sur une route @AllowTemporaryPassword()', async () => {
    const guard = makeGuard(true);
    await expect(guard.canActivate(makeContext({ id: 'u-1', mustChangePassword: true }))).resolves.toBe(true);
  });

  it("renvoie false si Passport n'a pas authentifie la requete", async () => {
    vi.spyOn(parentProto, 'canActivate').mockResolvedValue(false);
    const guard = makeGuard(undefined);
    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(false);
  });
});
