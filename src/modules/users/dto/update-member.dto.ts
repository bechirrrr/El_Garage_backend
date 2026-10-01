import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { MEMBER_ROLES } from './create-user.dto.js';

/** PATCH /users/:id : changer le role (Mecanicien <-> Accueil) et/ou activer / desactiver le compte. */
export class UpdateMemberDto {
  @IsOptional()
  @IsIn(MEMBER_ROLES)
  role?: (typeof MEMBER_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
