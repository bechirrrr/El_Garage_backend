import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Section 18/29 : Admin et Front Desk peuvent creer un Customer (pas le
 * Mecanicien -- voir le tableau de permissions de la Section 29).
 *
 * phone/email/address restent optionnels : a la creation, le garage n'a
 * parfois qu'un nom et un numero pris au telephone, le reste se complete
 * plus tard.
 */
export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  name!: string;

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
