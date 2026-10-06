import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passwordFingerprint } from '../../../common/password-fingerprint.js';
import { GarageStatus } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { CurrentUserPayload } from '../../../common/types/current-user.type.js';

/** La forme exacte de ce qu'on met dans le JWT au moment du login (voir AuthService.login). */
interface JwtPayload {
  sub: string;
  garageId: string | null;
  role: CurrentUserPayload['role'];
  /** Empreinte du mot de passe au moment du login (voir common/password-fingerprint.ts). */
  pv?: string;
}

/** Seules routes accessibles tant que le mot de passe provisoire n'a pas ete change. */
const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = ['/auth/change-password', '/auth/me'];

/**
 * Verifie la signature + l'expiration du Bearer token, puis appelle
 * validate() avec le payload decode. Ce que validate() retourne devient
 * `req.user` -- ici, exactement la forme que CurrentUserPayload (et donc
 * RolesGuard/GarageScopeGuard) attendent.
 *
 * validate() relit l'utilisateur (+ son Garage) en base a CHAQUE requete
 * authentifiee, plutot que de faire confiance aveuglement au payload du
 * JWT : un token signe reste valide jusqu'a son expiration (7 jours) meme
 * si, entretemps, l'Owner suspend/rejette le Garage ou qu'un compte est
 * desactive. Sans cette verification, un utilisateur deja connecte
 * garderait l'usage complet de l'API jusqu'a l'expiration de son token --
 * exactement ce qu'on veut empecher : suspendre un Garage doit couper
 * l'acces immediatement (a la prochaine requete), pas seulement a la
 * prochaine connexion. Le cout (une requete Prisma de plus par appel
 * authentifie) est le prix normal d'une revocation en temps reel avec des
 * JWT stateless -- l'alternative serait une blacklist/liste de sessions
 * cote serveur, hors de portee pour le MVP.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
      // Donne acces a la requete dans validate() (pour connaitre la route appelee).
      passReqToCallback: true,
    });
  }

  async validate(req: Pick<Request, 'originalUrl'>, payload: JwtPayload): Promise<CurrentUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { garage: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte introuvable ou desactive.');
    }

    // OWNER (garageId null) n'est jamais concerne par le statut d'un Garage --
    // seuls ADMIN/MECHANIC/FRONT_DESK, scopes a un Garage, le sont.
    if (user.garageId && user.garage?.status !== GarageStatus.ACTIVE) {
      throw new UnauthorizedException("L'acces a ce garage n'est plus autorise.");
    }

    // Token emis avant le dernier changement de mot de passe -> session revoquee.
    if (!user.passwordHash || payload.pv !== passwordFingerprint(user.passwordHash)) {
      throw new UnauthorizedException('Session expiree. Reconnectez-vous.');
    }

    // Mot de passe provisoire (compte cree par l'Admin) : verifie ICI, cote
    // serveur -- le frontend redirige deja vers /change-password, mais un
    // appel direct a l'API contournerait cette redirection.
    if (user.mustChangePassword) {
      const path = (req.originalUrl ?? '').split('?')[0];
      if (!ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.some((allowed) => path.endsWith(allowed))) {
        throw new ForbiddenException('Vous devez changer votre mot de passe provisoire avant de continuer.');
      }
    }

    return { id: user.id, garageId: user.garageId, role: user.role };
  }
}
