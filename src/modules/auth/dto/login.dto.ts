import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Email OU numero de telephone : un membre cree directement par l'Admin
   * peut n'avoir qu'un telephone (voir UsersService.create). Contient un @
   * -> recherche par email, sinon par telephone normalise.
   */
  @IsString()
  @MinLength(3)
  identifier!: string;

  // Pas de @MinLength(8) ici : on ne veut pas donner d'indice sur la regle
  // de complexite du mot de passe a quelqu'un qui essaie de se connecter.
  // Cette regle est deja appliquee a l'INSCRIPTION (RegisterGarageDto).
  @IsString()
  @MinLength(1)
  password!: string;
}
