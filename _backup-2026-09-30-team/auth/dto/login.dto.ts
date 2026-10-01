import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  // Pas de @MinLength(8) ici : on ne veut pas donner d'indice sur la regle
  // de complexite du mot de passe a quelqu'un qui essaie de se connecter.
  // Cette regle est deja appliquee a l'INSCRIPTION (RegisterGarageDto).
  @IsString()
  @MinLength(1)
  password!: string;
}
