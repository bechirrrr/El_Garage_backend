import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GarageScopeGuard } from './garage-scope.guard.js';

function makeContext(user: unknown, params: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext;
}

describe('GarageScopeGuard', () => {
  it("laisse passer si req.user.garageId correspond au parametre de route", () => {
    const guard = new GarageScopeGuard(); // parametre par defaut : "id"
    const context = makeContext({ garageId: 'garage-1' }, { id: 'garage-1' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejette si garageId ne correspond pas (utilisateur d\'un autre garage)', () => {
    const guard = new GarageScopeGuard();
    const context = makeContext({ garageId: 'garage-1' }, { id: 'garage-2' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejette un OWNER (garageId === null) sur toute route scopee a un garage', () => {
    const guard = new GarageScopeGuard();
    const context = makeContext({ garageId: null }, { id: 'garage-1' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('accepte un nom de parametre personnalise (ex: routes imbriquees)', () => {
    const guard = new GarageScopeGuard('garageId');
    const context = makeContext({ garageId: 'garage-1' }, { garageId: 'garage-1' });

    expect(guard.canActivate(context)).toBe(true);
  });
});
