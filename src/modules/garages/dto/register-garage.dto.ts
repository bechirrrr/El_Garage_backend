import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Section 4 de la spec : l'inscription cree le Garage ET son premier
 * utilisateur (l'Admin) en une seule requete -- il n'existe pas de "creer
 * un garage vide" independant de "s'inscrire comme Admin".
 */
export class RegisterGarageDto {
  @IsString()
  @MinLength(2)
  garageName!: string;

  @IsOptional()
  @IsString()
  garagePhone?: string;

  @IsOptional()
  @IsString()
  garageAddress?: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsEmail()
  adminEmail!: string;

  // Le hachage bcrypt se fait dans le service, jamais dans le DTO.
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignore tout ce qui depasse 72 octets
  adminPassword!: string;
}
