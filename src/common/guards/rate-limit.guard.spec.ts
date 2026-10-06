import { HttpException, type ExecutionContext } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard.js';

function makeContext(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('laisse passer jusqu a la limite, puis repond 429', () => {
    const guard = new RateLimitGuard(3, 60_000);
    const context = makeContext('1.1.1.1');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    try {
      guard.canActivate(context);
      throw new Error('aurait du rejeter');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('compte chaque adresse IP separement', () => {
    const guard = new RateLimitGuard(1, 60_000);

    expect(guard.canActivate(makeContext('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(makeContext('2.2.2.2'))).toBe(true);
    expect(() => guard.canActivate(makeContext('1.1.1.1'))).toThrow(HttpException);
  });

  it('autorise de nouveau une fois la fenetre ecoulee', () => {
    vi.useFakeTimers();
    const guard = new RateLimitGuard(1, 60_000);
    const context = makeContext('1.1.1.1');

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    vi.advanceTimersByTime(60_001);
    expect(guard.canActivate(context)).toBe(true);
  });
});
