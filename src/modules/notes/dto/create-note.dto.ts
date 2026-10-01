import { IsString, MinLength } from 'class-validator';

/**
 * Section 16 : une Note est un mot libre horodate ("10:42 Injector #3
 * values are abnormal."). Pas d'UpdateNoteDto (voir note.prisma) : une
 * correction s'exprime en ajoutant une nouvelle Note, jamais en reecrivant
 * une entree existante.
 */
export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
