import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CurrentUserPayload } from '../types/current-user.type.js';

/**
 * `@CurrentUser() user: CurrentUserPayload` dans un controller injecte
 * directement `req.user`, plutot que d'ecrire `@Req() req` puis `req.user`
 * dans chaque handler.
 *
 * Ne fonctionne qu'APRES un guard d'authentification qui a deja pose
 * `req.user` (le futur JwtAuthGuard du module Auth, pas encore construit).
 * Tant que ce guard n'existe pas, `req.user` est `undefined` -- ce
 * decorator est pret, mais rien ne l'alimente encore.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as CurrentUserPayload;
  },
);
