import { IsString, MinLength } from 'class-validator';

// Le token vient du parametre de route (URL), pas du corps de la requete.
export class AcceptInvitationDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
