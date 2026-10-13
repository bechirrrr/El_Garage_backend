import { IsEnum, IsOptional } from 'class-validator';
import { ListFilterDto } from '../../../common/dto/list-filter.dto.js';
import { ReservationStatus } from '../../../generated/prisma/client.js';

/**
 * GET /reservations : filtres client / vehicule (ListFilterDto) + statut.
 * ?status=PENDING sert au badge "RDV en attente" de la barre laterale, qui
 * telechargeait auparavant TOUS les rendez-vous (historique compris) a chaque
 * chargement de page juste pour compter ceux en attente.
 */
export class ReservationListFilterDto extends ListFilterDto {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;
}
