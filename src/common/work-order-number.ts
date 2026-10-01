import type { Prisma } from '../generated/prisma/client.js';

/**
 * Attribue le prochain numero d'ordre de reparation (OR-1, OR-2...) d'un garage.
 *
 * A appeler DANS la meme transaction que tx.workOrder.create (WorkOrdersService
 * et la conversion d'un RDV dans ReservationsService).
 *
 * Pourquoi un compteur sur Garage plutot que "MAX(number) + 1" ?
 * Deux personnes qui creent un OR au meme moment liraient le meme MAX et
 * obtiendraient le meme numero. Ici, l'UPDATE ... increment est atomique :
 * Postgres verrouille la ligne du garage jusqu'a la fin de la transaction,
 * donc la 2e creation attend que la 1re soit terminee et recoit le numero
 * suivant. Filet de securite en plus : @@unique([garageId, number]).
 */
export async function nextWorkOrderNumber(tx: Prisma.TransactionClient, garageId: string): Promise<number> {
  const garage = await tx.garage.update({
    where: { id: garageId },
    data: { workOrderCounter: { increment: 1 } },
    select: { workOrderCounter: true },
  });
  return garage.workOrderCounter;
}
