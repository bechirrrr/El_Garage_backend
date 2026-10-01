import { IsIn } from 'class-validator';
import { ReservationStatus } from '../../../generated/prisma/client.js';

/**
 * CONVERTED n'est volontairement PAS une valeur acceptee ici : passer par
 * cet etat cree un vrai WorkOrder, ce n'est pas un simple changement de
 * champ -- voir ReservationsController.convert / ReservationsService.convert.
 */
export class UpdateReservationStatusDto {
  @IsIn([ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW])
  status!: typeof ReservationStatus.CONFIRMED | typeof ReservationStatus.CANCELLED | typeof ReservationStatus.NO_SHOW;
}
