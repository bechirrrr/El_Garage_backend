import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../../generated/prisma/client.js';

export const MEMBER_ROLES = [Role.MECHANIC, Role.FRONT_DESK] as const;

/**
 * Creation directe d'un membre par l'Admin, sans invitation par email.
 * Memes roles que CreateInvitationDto (jamais ADMIN ni OWNER). Le mot de
 * passe est provisoire : le compte est cree avec mustChangePassword = true.
 *
 * Email et telephone sont chacun optionnels, mais il en faut au moins un :
 * c'est l'identifiant avec lequel le membre se connecte (verifie dans
 * UsersService.create). Un mecanicien sans adresse email peut donc avoir
 * un compte avec son seul numero de telephone.
 */
export class CreateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(MEMBER_ROLES)
  role!: (typeof MEMBER_ROLES)[number];

  @IsString()
  @MinLength(8)
  password!: string;
}
