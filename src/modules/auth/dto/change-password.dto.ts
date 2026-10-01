import { IsString, MinLength } from 'class-validator';

/** POST /auth/change-password -- l'utilisateur connecte change son propre mot de passe. */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
