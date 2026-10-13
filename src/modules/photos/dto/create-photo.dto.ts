import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';
import { PhotoStage } from '../../../generated/prisma/client.js';

/**
 * Section 15 : une Photo n'a aucun champ modifiable une fois creee (voir
 * le commentaire dans photo.prisma) -- pas d'UpdatePhotoDto, uniquement
 * create/list/delete (voir PhotosService.remove). `url` reference un
 * fichier stocke ailleurs (S3, Cloudinary...) : ce DTO ne recoit jamais de
 * binaire, juste sa reference.
 */
export class CreatePhotoDto {
  // http(s) uniquement : bloque javascript:, data:, etc. (require_tld: false
  // pour accepter http://localhost en dev).
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsIn(Object.values(PhotoStage))
  stage?: PhotoStage;
}
