import { IsString } from 'class-validator';

// Pas de "desassigner" pour l'instant (assignedMechanicId -> null) : le
// besoin ne s'est pas encore presente. Un endpoint dedie viendra si utile.
export class AssignWorkOrderDto {
  @IsString()
  assignedMechanicId!: string;
}
