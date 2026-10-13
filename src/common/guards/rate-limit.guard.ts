import { HttpException, HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

/**
 * Limitation de debit simple, en memoire : au plus `limit` requetes par
 * adresse IP sur une fenetre glissante de `windowMs` millisecondes.
 *
 * But : freiner le brute-force sur les routes PUBLIQUES (login, inscription,
 * invitation par token), les seules qu'on peut appeler sans JWT.
 *
 * S'utilise comme GarageScopeGuard, par instance (une instance = un compteur
 * propre a la route) :
 *
 *   @UseGuards(new RateLimitGuard(20, 15 * 60_000))
 *
 * Limite assumee pour le MVP : les compteurs vivent dans la memoire du
 * processus -- ils repartent de zero au redemarrage et ne sont pas partages
 * entre plusieurs instances de l'API. Le jour ou l'API tourne sur plusieurs
 * instances, remplacer par @nestjs/throttler avec un stockage Redis.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /** IP -> horodatages (ms) des requetes encore dans la fenetre. */
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key: string = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const now = Date.now();

    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterSeconds = Math.ceil((this.windowMs - (now - recent[0])) / 1000);
      throw new HttpException(
        `Trop de tentatives. Reessayez dans ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.prune(now);
    return true;
  }

  /** Evite que la Map grossisse sans fin : retire les IP dont la fenetre est entierement expiree. */
  private prune(now: number) {
    if (this.hits.size < 5000) {
      return;
    }
    for (const [key, times] of this.hits) {
      if (times.every((time) => now - time >= this.windowMs)) {
        this.hits.delete(key);
      }
    }
  }
}
