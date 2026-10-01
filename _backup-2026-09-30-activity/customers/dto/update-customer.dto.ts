import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Pas de PartialType(@nestjs/mapped-types) ici : le projet n'a pas cette
 * dependance et le reste du code prefere des DTO ecrits a la main
 * (voir CreateInvitationDto / RegisterGarageDto) -- on reste coherent.
 * Tous les champs sont optionnels : un update ne fournit que ce qui change.
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
