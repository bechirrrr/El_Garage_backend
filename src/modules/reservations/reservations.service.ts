import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, ReservationStatus, Role } from '../../generated/prisma/client.js';
import { logActivity } from '../../common/activity-log.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { nextWorkOrderNumber } from '../../common/work-order-number.js';
import type { ConvertReservationDto } from './dto/convert-reservation.dto.js';
import type { CreateReservationDto } from './dto/create-reservation.dto.js';
import type { UpdateReservationStatusDto } from './dto/update-reservation-status.dto.js';
import type { UpdateReservationDto } from './dto/update-reservation.dto.js';

/**
 * Meme forme minimale que WorkOrdersService.EventWriter : tolere aussi bien
 * this.prisma (hors transaction) que `tx` (dans un $transaction). Dupliquee
 * volontairement, meme convention que partout ailleurs dans ce projet.
 */
/** Date d'un rendez-vous pour les messages du journal, a l'heure de Tunis (ex. "02/10 09:30"). */
function slot(date: Date | null | undefined): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Tunis',
  }).format(new Date(date));
}

const STATUS_EVENT: Record<string, { type: string; verb: string }> = {
  CONFIRMED: { type: 'RESERVATION_CONFIRMED', verb: 'confirmé' },
  CANCELLED: { type: 'RESERVATION_CANCELLED', verb: 'annulé' },
  NO_SHOW: { type: 'RESERVATION_NO_SHOW', verb: 'marqué absent' },
};

type EventWriter = { activityEvent: { create: (args: any) => Promise<unknown> } };

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Si assignedMechanicId est fourni, il doit pointer vers un MECHANIC du
   * meme garage -- meme regle que TasksService.assertValidAssignee /
   * WorkOrdersService.assign.
   */
  private async assertValidMechanic(garageId: string, assignedMechanicId: string | undefined | null) {
    if (!assignedMechanicId) {
      return;
    }
    const mechanic = await this.prisma.user.findUnique({ where: { id: assignedMechanicId } });
    if (!mechanic || mechanic.garageId !== garageId || mechanic.role !== Role.MECHANIC) {
      throw new BadRequestException('Ce mecanicien est introuvable dans ce garage.');
    }
  }

  private async getOwned(garageId: string, id: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation || reservation.garageId !== garageId) {
      throw new NotFoundException('Reservation introuvable.');
    }
    return reservation;
  }

  /**
   * Section 33 : le Mecanicien voit UNIQUEMENT ses rendez-vous assignes
   * ("view only, and only the reservations assigned to him") -- verifie
   * ici plutot que dans le controller, comme partout ailleurs dans ce
   * projet (RolesGuard ne peut pas voir la donnee).
   */
  private assertVisible(userId: string, userRole: Role, reservation: { assignedMechanicId: string | null }) {
    if (userRole === Role.MECHANIC && reservation.assignedMechanicId !== userId) {
      throw new ForbiddenException('Vous ne pouvez voir que vos propres rendez-vous assignes.');
    }
  }

  /**
   * Meme regle de visibilite que findOne, appliquee comme filtre WHERE
   * plutot qu'un rejet apres coup -- un Mecanicien ne doit meme pas savoir
   * qu'une reservation non-assignee existe.
   */
  findAllForGarage(garageId: string, userId: string, userRole: Role) {
    return this.prisma.reservation.findMany({
      where: {
        garageId,
        ...(userRole === Role.MECHANIC ? { assignedMechanicId: userId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        vehicle: { select: { id: true, make: true, model: true, plate: true } },
        assignedMechanic: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(garageId: string, userId: string, userRole: Role, id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicle: true,
        assignedMechanic: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!reservation || reservation.garageId !== garageId) {
      throw new NotFoundException('Reservation introuvable.');
    }
    this.assertVisible(userId, userRole, reservation);
    return reservation;
  }

  /**
   * Section 33 : "Admin/Front Desk -> full access". Pas de restriction
   * MECHANIC ici -- deja bloque en amont par @Roles() sur le controller.
   */
  async create(garageId: string, actorId: string, dto: CreateReservationDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || customer.garageId !== garageId) {
      throw new NotFoundException('Client introuvable dans ce garage.');
    }

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle || vehicle.garageId !== garageId) {
        throw new NotFoundException('Vehicule introuvable dans ce garage.');
      }
    }

    await this.assertValidMechanic(garageId, dto.assignedMechanicId);

    const reservation = await this.prisma.reservation.create({
      data: {
        garageId,
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        scheduledAt: new Date(dto.scheduledAt),
        reason: dto.reason,
        assignedMechanicId: dto.assignedMechanicId,
        durationMinutes: dto.durationMinutes,
        createdById: actorId,
      },
    });
    await logActivity(this.prisma, {
      garageId,
      actorId,
      reservationId: reservation.id,
      customerId: reservation.customerId,
      vehicleId: reservation.vehicleId,
      type: 'RESERVATION_CREATED',
      message: `RDV planifié le ${slot(reservation.scheduledAt)} pour ${customer.name}`,
    });
    return reservation;
  }

  /** customerId est fige a la creation -- jamais modifiable ici (voir UpdateReservationDto). */
  async update(garageId: string, id: string, dto: UpdateReservationDto, actorId?: string) {
    const reservation = await this.getOwned(garageId, id);

    if (
      reservation.status === ReservationStatus.CONVERTED ||
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW
    ) {
      throw new BadRequestException('Cette reservation est terminee, elle ne peut plus etre modifiee.');
    }

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle || vehicle.garageId !== garageId) {
        throw new NotFoundException('Vehicule introuvable dans ce garage.');
      }
    }
    if (dto.assignedMechanicId !== undefined) {
      await this.assertValidMechanic(garageId, dto.assignedMechanicId);
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: {
        vehicleId: dto.vehicleId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        reason: dto.reason,
        assignedMechanicId: dto.assignedMechanicId,
        durationMinutes: dto.durationMinutes,
      },
      include: { customer: { select: { name: true } } },
    });
    const moved = !!dto.scheduledAt && new Date(dto.scheduledAt).getTime() !== new Date(reservation.scheduledAt).getTime();
    await logActivity(this.prisma, {
      garageId,
      actorId,
      reservationId: id,
      customerId: updated.customerId,
      vehicleId: updated.vehicleId,
      type: moved ? 'RESERVATION_RESCHEDULED' : 'RESERVATION_UPDATED',
      message: moved
        ? `RDV de ${updated.customer?.name ?? 'client'} déplacé au ${slot(updated.scheduledAt)}`
        : `RDV de ${updated.customer?.name ?? 'client'} modifié (${slot(updated.scheduledAt)})`,
      metadata: { fields: Object.keys(dto) },
    });
    return updated;
  }

  /**
   * Transitions autorisees : PENDING/CONFIRMED -> CONFIRMED|CANCELLED|
   * NO_SHOW uniquement -- pas de retour arriere depuis un etat final.
   * CONVERTED n'est jamais une cible ici, voir convert() qui fait plus
   * qu'un changement de statut (cree un WorkOrder).
   */
  async updateStatus(garageId: string, id: string, dto: UpdateReservationStatusDto, actorId?: string) {
    const reservation = await this.getOwned(garageId, id);

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException('Cette reservation est deja dans un etat final.');
    }

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: dto.status },
      include: { customer: { select: { name: true } } },
    });
    const event = STATUS_EVENT[dto.status] ?? { type: 'RESERVATION_STATUS_CHANGED', verb: 'mis à jour' };
    await logActivity(this.prisma, {
      garageId,
      actorId,
      reservationId: id,
      customerId: updated.customerId,
      vehicleId: updated.vehicleId,
      type: event.type,
      message: `RDV de ${updated.customer?.name ?? 'client'} du ${slot(updated.scheduledAt)} ${event.verb}`,
    });
    return updated;
  }

  /**
   * Section 33, flow "reservation -> ticket" : cree un vrai WorkOrder,
   * pre-rempli avec Vehicle/reason de la Reservation, dans la MEME
   * transaction que le changement de statut -- les deux doivent reussir
   * ensemble. Duplique volontairement une version minimale de la creation
   * de WorkOrder plutot que d'appeler WorkOrdersService (qui gere sa
   * propre transaction independante) -- meme convention que partout
   * ailleurs dans ce projet.
   *
   * customerId du nouveau WorkOrder vient du Vehicle, pas de la
   * Reservation elle-meme -- exactement la meme regle que
   * WorkOrdersService.create (le proprietaire au moment du ticket doit
   * rester fige, meme si la Reservation et le Vehicle divergent un jour).
   */
  async convert(garageId: string, actorId: string, id: string, dto: ConvertReservationDto) {
    const reservation = await this.getOwned(garageId, id);

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException('Seule une reservation en attente ou confirmee peut etre convertie.');
    }

    const vehicleId = dto.vehicleId ?? reservation.vehicleId;
    if (!vehicleId) {
      throw new BadRequestException('Un vehicule est requis pour convertir cette reservation en ticket.');
    }
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.garageId !== garageId) {
      throw new NotFoundException('Vehicule introuvable dans ce garage.');
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await nextWorkOrderNumber(tx, garageId);
      const workOrder = await tx.workOrder.create({
        data: {
          garageId,
          number,
          vehicleId: vehicle.id,
          customerId: vehicle.customerId,
          createdById: actorId,
          problemReported: reservation.reason,
          mileage: dto.mileage,
          assignedMechanicId: reservation.assignedMechanicId ?? undefined,
          // Le ticket reprend le creneau du RDV : sur le calendrier, le bloc
          // "rendez-vous" est remplace par le bloc "ticket" au meme endroit.
          scheduledAt: reservation.scheduledAt,
          estimatedMinutes: reservation.durationMinutes,
        },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId: workOrder.id,
        actorId,
        type: 'WORK_ORDER_CREATED',
        category: ActivityCategory.GENERAL,
        message: `Ticket ouvert depuis une reservation pour ${vehicle.make} ${vehicle.model} (${vehicle.plate})`,
        metadata: { reservationId: reservation.id },
        reservationId: reservation.id,
        customerId: workOrder.customerId,
        vehicleId: workOrder.vehicleId,
      });

      const updatedReservation = await tx.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CONVERTED, convertedWorkOrderId: workOrder.id },
      });

      return { reservation: updatedReservation, workOrder };
    });
  }

  private recordEvent(
    client: EventWriter,
    event: {
      garageId: string;
      workOrderId: string;
      reservationId?: string;
      customerId?: string;
      vehicleId?: string;
      actorId: string | null;
      type: string;
      category: ActivityCategory;
      message: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return client.activityEvent.create({ data: event });
  }
}
