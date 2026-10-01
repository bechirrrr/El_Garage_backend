import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

/**
 * `@Roles('OWNER')` ou `@Roles('ADMIN', 'FRONT_DESK')` sur une route : pose
 * une metadonnee que RolesGuard lit ensuite pour autoriser ou bloquer la
 * requete. Ne fait RIEN seul -- doit toujours etre combine avec
 * `@UseGuards(RolesGuard)` sur le meme handler (ou le controller).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
