import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PhotoStage } from '../../../generated/prisma/client.js';

/**
 * Section 15 : une Photo n'a aucun champ modifiable une fois creee (voir
 * le commentaire dans photo.prisma) -- pas d'UpdatePhotoDto, uniquement
 * create/list/delete (voir PhotosService.remove). `url` reference un
 * fichier stocke ailleurs (S3, Cloudinary...) : ce DTO ne recoit jamais de
 * binaire, juste sa reference.
 */
export class CreatePhotoDto {
  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsIn(Object.values(PhotoStage))
  stage?: PhotoStage;
}
