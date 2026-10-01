import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { CurrentUserPayload } from '../types/current-user.type.js';

/**
 * Verifie que `req.user.role` fait partie des roles autorises par
 * `@Roles(...)` sur la route. Si la route n'a PAS de `@Roles()`, le guard
 * laisse passer -- il ne bloque QUE ce qui est explicitement restreint,
 * jamais par defaut.
 *
 * PREREQUIS non encore construit : un guard d'authentification
 * (JwtAuthGuard, module Auth) doit s'executer AVANT celui-ci dans
 * `@UseGuards(...)` et poser `req.user`, sinon ce guard rejette toujours la
 * requete (user est undefined).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload | undefined;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Cette action necessite l'un de ces roles : ${requiredRoles.join(', ')}.`,
      );
    }

    return true;
  }
}
