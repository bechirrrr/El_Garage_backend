import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PartStatus } from '../../../generated/prisma/client.js';

/**
 * Contrairement a CreatePartDto, `status` est modifiable ici -- c'est le
 * coeur du cycle de vie d'une Part (Section 14) : une piece commandee passe
 * ORDERED, puis RECEIVED a l'arrivee, puis USED une fois montee. C'est ce
 * champ qui permet de detecter "reparation bloquee en attente de piece".
 */
export class UpdatePartDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsIn(Object.values(PartStatus))
  status?: PartStatus;
}
