import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Enveloppe fine autour de la strategie 'jwt' de Passport (voir
 * modules/auth/strategies/jwt.strategy.ts). C'est CE guard qui verifie le
 * Bearer token et pose `req.user` -- il doit toujours etre le PREMIER
 * guard de la chaine sur une route protegee :
 *
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @UseGuards(JwtAuthGuard, GarageScopeGuard)
 *
 * Sans lui en premiere position, RolesGuard/GarageScopeGuard voient
 * `req.user === undefined` et rejettent systematiquement la requete.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
