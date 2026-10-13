import type { Role } from '../../generated/prisma/client.js';

/**
 * Forme de `req.user` une fois l'authentification branchee (module Auth,
 * pas encore construit). Le futur JwtStrategy attachera cet objet a la
 * requete apres avoir verifie le token JWT.
 *
 * garageId est nullable pour la meme raison que sur le modele User :
 * un OWNER n'appartient a aucun garage precis.
 */
export interface CurrentUserPayload {
  id: string;
  garageId: string | null;
  role: Role;
  /** true tant qu'un compte cree par l'Admin n'a pas remplace son mot de passe provisoire (voir JwtAuthGuard). */
  mustChangePassword?: boolean;
}
