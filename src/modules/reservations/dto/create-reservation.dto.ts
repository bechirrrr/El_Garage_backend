import { IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * Section 33 : une Reservation nait toujours PENDING (voir @default(PENDING)
 * sur le schema) -- pas de champ status ici.
 *
 * customerId est obligatoire (contrairement au brouillon initial de la spec
 * qui envisageait un fallback customerName/customerPhone pour "un nouveau
 * contact") : le schema migre exige un Customer deja cree -- Front Desk cree
 * rapidement le Customer d'abord (CustomersModule), deux ecrans separes.
 *
 * vehicleId reste optionnel (point ouvert #4 de la spec, tranche dans
 * reservation.prisma) : un client recurrent peut deja avoir son vehicule
 * connu, un nouveau contact non.
 */
export class CreateReservationDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  assignedMechanicId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
