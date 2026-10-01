import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

/**
 * On teste ce guard tout seul, sans monter un module NestJS complet et sans
 * attendre que le module Auth existe : un ExecutionContext, ca se simule a
 * la main, il suffit de fournir les deux methodes que le guard appelle
 * (getHandler/getClass) et un faux `request.user`.
 */
function makeContext(user: unknown, params: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('laisse passer si la route ne declare aucun @Roles()', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('laisse passer si req.user.role fait partie des roles requis', () => {
    const reflector = { getAllAndOverride: () => ['OWNER'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(makeContext({ role: 'OWNER' }))).toBe(true);
  });

  it('rejette si req.user.role ne fait pas partie des roles requis', () => {
    const reflector = { getAllAndOverride: () => ['OWNER'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(makeContext({ role: 'ADMIN' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejette si req.user est absent (pas encore authentifie)', () => {
    const reflector = { getAllAndOverride: () => ['OWNER'] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
