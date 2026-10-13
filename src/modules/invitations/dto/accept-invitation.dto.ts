import { IsString, MaxLength, MinLength } from 'class-validator';

// Le token vient du parametre de route (URL), pas du corps de la requete.
export class AcceptInvitationDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignore tout ce qui depasse 72 octets
  password!: string;
}
