import { IsOptional, IsString } from 'class-validator';

/**
 * Filtres optionnels des listes GET /work-orders, /vehicles, /reservations.
 *
 * Les fiches Client et Vehicule n'affichent que les OR / vehicules / RDV de
 * CE client ou de CE vehicule : plutot que de telecharger toute la liste du
 * garage puis de filtrer dans le navigateur, elles passent ?customerId= ou
 * ?vehicleId= et le filtre est fait par Postgres (index customer_id /
 * vehicle_id deja en place). Sans parametre : liste complete, comme avant.
 */
export class ListFilterDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;
}

/** Ne garde que les filtres renseignes (jamais `customerId: undefined` dans un where Prisma). */
export function listFilterWhere(filter?: ListFilterDto) {
  return {
    ...(filter?.customerId ? { customerId: filter.customerId } : {}),
    ...(filter?.vehicleId ? { vehicleId: filter.vehicleId } : {}),
  };
}
