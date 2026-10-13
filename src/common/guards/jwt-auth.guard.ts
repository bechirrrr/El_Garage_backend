import { ForbiddenException, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_TEMPORARY_PASSWORD_KEY } from '../decorators/allow-temporary-password.decorator.js';
import type { CurrentUserPayload } from '../types/current-user.type.js';

/**
 * Enveloppe autour de la strategie 'jwt' de Passport (voir
 * modules/auth/strategies/jwt.strategy.ts). C'est CE guard qui verifie le
 * Bearer token et pose `req.user` -- il doit toujours etre le PREMIER
 * guard de la chaine sur une route protegee :
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @UseGuards(JwtAuthGuard, GarageScopeGuard)
 *
 * Sans lui en premiere position, RolesGuard/GarageScopeGuard voient
 * `req.user === undefined` et rejettent systematiquement la requete.
 *
 * Mot de passe provisoire : un compte cree par l'Admin (mustChangePassword)
 * doit changer son mot de passe avant d'utiliser l'API. Avant, seul le
 * frontend Angular l'imposait -- un appel direct a l'API (Postman, curl)
 * passait. Desormais le serveur renvoie 403 sur toute route qui n'est pas
 * marquee @AllowTemporaryPassword().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) {
      return false;
    }

    const user = context.switchToHttp().getRequest().user as CurrentUserPayload | undefined;
    if (user?.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_TEMPORARY_PASSWORD_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new ForbiddenException('Vous devez changer votre mot de passe provisoire avant de continuer.');
      }
    }
    return true;
  }
}
