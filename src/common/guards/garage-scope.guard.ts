import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { CurrentUserPayload } from '../types/current-user.type.js';

/**
 * LE guard multi-tenant : empeche un utilisateur d'agir sur un garage qui
 * n'est pas le sien. Compare `req.user.garageId` (pose par le futur
 * JwtAuthGuard) au parametre de route dont le nom est donne au constructeur
 * (`id` par defaut -- utiliser `new GarageScopeGuard('garageId')` pour une
 * route imbriquee du style `/garages/:garageId/customers`).
 *
 * Un OWNER a toujours `garageId === null` : il ne passera donc JAMAIS ce
 * guard, ce qui est le comportement voulu (Section 28 -- l'Owner ne doit
 * pas pouvoir agir comme un Admin a l'interieur d'un garage). Les actions
 * reservees a l'Owner (approve/reject/suspend/reactivate) passent par
 * RolesGuard + @Roles('OWNER'), pas par ce guard-ci.
 *
 * PREREQUIS non encore construit : comme RolesGuard, ce guard suppose que
 * `req.user` existe deja (JwtAuthGuard du futur module Auth).
 */
@Injectable()
export class GarageScopeGuard implements CanActivate {
  constructor(private readonly paramName: string = 'id') {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload | undefined;
    const requestedGarageId = request.params?.[this.paramName];

    if (!user || !requestedGarageId || user.garageId !== requestedGarageId) {
      throw new ForbiddenException("Vous n'avez pas acces a ce garage.");
    }

    return true;
  }
}
