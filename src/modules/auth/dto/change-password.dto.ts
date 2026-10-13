import { IsString, MaxLength, MinLength } from 'class-validator';

/** POST /auth/change-password -- l'utilisateur connecte change son propre mot de passe. */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignore tout ce qui depasse 72 octets
  newPassword!: string;
}
