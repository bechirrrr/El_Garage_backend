import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { Role } from '../../../generated/prisma/client.js';

const INVITABLE_ROLES = [Role.MECHANIC, Role.FRONT_DESK] as const;

/**
 * Seuls MECHANIC et FRONT_DESK peuvent etre invites (Sections 18/29) :
 * ADMIN se cree via l'inscription du garage (GaragesService.register), et
 * OWNER n'est jamais cree par ce chemin -- son compte est seede a part
 * (Section 28), pas cree via une invitation d'Admin.
 */
export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];
}
