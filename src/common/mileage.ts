import { BadRequestException } from '@nestjs/common';

/** Forme minimale commune a this.prisma et a `tx` (meme idee que EventWriter). */
type MileageReader = { workOrder: { aggregate: (args: any) => Promise<any> } };

/**
 * Un compteur kilometrique ne recule jamais : refuse un kilometrage inferieur
 * au dernier kilometrage connu du vehicule.
 *
 * "Dernier connu" = le plus grand entre le kilometrage de la fiche vehicule
 * (`vehicleMileage`) et celui des tickets (OR) deja enregistres pour ce vehicule.
 *
 * `before` : pour la MODIFICATION d'un ticket existant, on ne compare qu'aux
 * tickets ouverts AVANT lui (sinon on ne pourrait plus corriger un ancien
 * ticket des qu'un ticket plus recent a un kilometrage plus eleve).
 */
export async function assertMileageNotDecreasing(
  client: MileageReader,
  params: {
    garageId: string;
    vehicleId: string;
    mileage: number | null | undefined;
    vehicleMileage?: number | null;
    before?: Date;
  },
): Promise<void> {
  const { garageId, vehicleId, mileage, vehicleMileage, before } = params;
  if (mileage === undefined || mileage === null) {
    return;
  }

  const result = await client.workOrder.aggregate({
    where: { garageId, vehicleId, ...(before ? { createdAt: { lt: before } } : {}) },
    _max: { mileage: true },
  });
  const last = Math.max(vehicleMileage ?? 0, result?._max?.mileage ?? 0);

  if (mileage < last) {
    throw new BadRequestException(
      `Vérifier le kilométrage (ancien kilométrage : ${last} km).`,
    );
  }
}
