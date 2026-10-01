import { Logger } from '@nestjs/common';
import { ActivityCategory } from '../generated/prisma/client.js';

/** PrismaService ou le client d'une transaction ($transaction(async (tx) => ...)) : les deux ont activityEvent.create. */
type ActivityWriter = { activityEvent: { create: (args: any) => Promise<unknown> } };

export interface ActivityInput {
  garageId: string;
  /** Auteur de l'action (null = action systeme). */
  actorId?: string | null;
  /** Ex. CUSTOMER_CREATED, VEHICLE_UPDATED, RESERVATION_CANCELLED... (String libre, voir activity-event.prisma). */
  type: string;
  message: string;
  category?: ActivityCategory;
  /** Au moins l'un de ces liens quand l'objet existe encore (null apres une suppression). */
  workOrderId?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  reservationId?: string | null;
  metadata?: Record<string, unknown>;
}

const logger = new Logger('ActivityLog');

/**
 * Ecrit une ligne du journal d'activite (fiche membre "ses actions", fiche OR).
 * Utilise pour les actions HORS OR : clients, vehicules, rendez-vous.
 *
 * Un echec d'ecriture du journal ne doit jamais faire echouer l'action metier
 * qui vient de reussir (le client a bien ete cree, par exemple) : l'erreur est
 * seulement loguee, meme idee que MailService.
 */
export async function logActivity(client: ActivityWriter, event: ActivityInput): Promise<void> {
  try {
    await client.activityEvent.create({
      data: {
        ...event,
        category: event.category ?? ActivityCategory.GENERAL,
        actorId: event.actorId ?? null,
      },
    });
  } catch (error) {
    logger.warn(`Action non enregistree dans le journal (${event.type}) : ${(error as Error)?.message ?? error}`);
  }
}
