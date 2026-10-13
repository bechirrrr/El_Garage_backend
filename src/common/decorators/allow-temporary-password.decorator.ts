import { SetMetadata } from '@nestjs/common';

export const ALLOW_TEMPORARY_PASSWORD_KEY = 'allowTemporaryPassword';

/**
 * Marque une route accessible a un utilisateur qui n'a PAS encore remplace
 * son mot de passe provisoire (mustChangePassword = true). Toutes les autres
 * routes protegees par JwtAuthGuard lui renvoient 403 tant qu'il ne l'a pas
 * change. A reserver au strict minimum : GET /auth/me (le frontend s'en
 * sert pour verifier la session) et POST /auth/change-password.
 */
export const AllowTemporaryPassword = () => SetMetadata(ALLOW_TEMPORARY_PASSWORD_KEY, true);
