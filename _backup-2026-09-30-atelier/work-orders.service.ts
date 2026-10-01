import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { nextWorkOrderNumber } from '../../common/work-order-number.js';
import type { AssignWorkOrderDto } from './dto/assign-work-order.dto.js';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import type { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto.js';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';

/**
 * Forme minimale commune pour journaliser un ActivityEvent, que ce soit via
 * this.prisma (hors transaction) ou via `tx` (dans un $transaction) -- les
 * deux exposent la meme API `activityEvent.create`. Type pragmatique (`any`
 * sous-jacent tolere par la config oxlint du projet) plutot que d'importer
 * le type Prisma.TransactionClient rien que pour ce detail interne.
 */
type EventWriter = { activityEvent: { create: (args: any) => Promise<unknown> } };

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * customerId n'est jamais fourni par le client : on le lit sur le Vehicle
   * au moment de l'ouverture du ticket et on le fige sur le WorkOrder (voir
   * le commentaire de work-order.prisma) -- si le vehicule change de
   * proprietaire plus tard, ce ticket-la garde le proprietaire d'origine.
   *
   * Creation + premier ActivityEvent (GENERAL, "ticket ouvert") dans la
   * meme transaction : les deux doivent reussir ensemble, jamais l'un sans
   * l'autre (sinon la timeline du ticket commencerait avec un trou).
   */
  async create(garageId: string, userId: string, dto: CreateWorkOrderDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
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
          createdById: userId,
          mileage: dto.mileage,
          problemReported: dto.problemReported,
          priority: dto.priority,
          // Walk-in sans creneau precise : le vehicule est la maintenant,
          // donc le ticket apparait au moment de son ouverture sur le calendrier.
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
          estimatedMinutes: dto.estimatedMinutes,
        },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId: workOrder.id,
        actorId: userId,
        type: 'WORK_ORDER_CREATED',
        category: ActivityCategory.GENERAL,
        message: `OR-${number} ouvert pour ${vehicle.make} ${vehicle.model} (${vehicle.plate})`,
      });

      return workOrder;
    });
  }

  /**
   * Section 20 : "View Work Order (all)" -- Admin, Mecanicien et Front Desk
   * voient TOUS les tickets du garage, pas seulement les leurs (contrairement
   * a la modification). Pas de filtre par createdById/assignedMechanicId ici.
   */
  findAllForGarage(garageId: string, role?: Role) {
    // Montant de la facture (fiche client / fiche vehicule : "Total facture").
    // Jamais pour un MECHANIC : il n'a aucun acces a la facturation (InvoicesController
    // lui renvoie 403), donc la liste ne doit pas lui donner ces montants par la bande.
    const withInvoice = role !== undefined && role !== Role.MECHANIC;
    return this.prisma.workOrder.findMany({
      where: { garageId },
      include: {
        vehicle: { select: { id: true, make: true, model: true, plate: true } },
        customer: { select: { id: true, name: true } },
        assignedMechanic: { select: { id: true, name: true } },
        ...(withInvoice ? { invoice: { select: { totalPrice: true, status: true } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Vue detail d'un ticket : inclut la timeline (ActivityEvent, Section 17)
   * directement -- c'est ce qui fait d'un WorkOrder un ticket "lisible" et
   * pas juste un enregistrement plat. Diagnosis/Task/Part/Photo/Note auront
   * chacun leur propre module et leurs propres routes plus tard ; en
   * attendant, un `_count` donne un apercu du contenu du ticket sans tout
   * charger.
   *
   * activityEvents.actor est inclus ici (pas dans findAllForGarage) : la
   * spec (Section 30bis) veut un affichage du type "Front Desk (Mariem)
   * total_price: 850 -> 950" pour les evenements SENSITIVE -- sans cet
   * include, le frontend n'aurait que actorId (un UUID brut, inutilisable
   * en affichage). category (GENERAL|SENSITIVE) sur ActivityEvent fusionne
   * volontairement l'historique narratif (Section 17) et l'AuditLog
   * structure (Section 30bis) dans la meme table -- voir le commentaire de
   * tete de activity-event.prisma -- donc aucune nouvelle table n'est
   * necessaire ici, juste ce filtrage cote frontend sur `category`.
   */
  async findOne(garageId: string, userId: string, userRole: Role, id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        vehicle: true,
        customer: true,
        createdBy: { select: { id: true, name: true, role: true } },
        assignedMechanic: { select: { id: true, name: true, role: true } },
        diagnosis: true,
        invoice: { include: { payments: { orderBy: { paidAt: 'asc' } } } },
        activityEvents: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true, role: true } } },
        },
        _count: { select: { tasks: true, parts: true, photos: true, notes: true } },
      },
    });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }
    return { ...workOrder, activityEvents: this.filterAuditVisibility(workOrder.activityEvents, userId, userRole) };
  }

  /**
   * Section 30bis : "The Admin (and the Front Desk for his own actions)
   * can view the full audit trail". category SENSITIVE porte les
   * changements de prix/statut/assignation (voir activity-event.prisma) --
   * l'Admin voit tout, le Front Desk ne voit que les SENSITIVE dont IL est
   * l'auteur (jamais ceux d'un autre Front Desk/Admin), le Mecanicien n'a
   * aucun acces a la couche SENSITIVE. category GENERAL (Section 17, la
   * timeline narrative) reste visible a tous les roles garage-scoped, sans
   * filtre.
   */
  private filterAuditVisibility<T extends { category: string; actorId: string | null }>(
    events: T[],
    userId: string,
    userRole: Role,
  ): T[] {
    if (userRole === Role.ADMIN) {
      return events;
    }
    return events.filter((event) => event.category !== 'SENSITIVE' || (userRole === Role.FRONT_DESK && event.actorId === userId));
  }

  /** Fetch "brut" pour les controles d'appartenance/ownership internes. */
  private async getOwned(garageId: string, id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }
    return workOrder;
  }

  /**
   * Regle utilisee par update() (Section 20) : Admin et Front Desk peuvent
   * tout modifier, un Mecanicien seulement CE QU'IL A CREE. Meme logique
   * que VehiclesService.update, appliquee ici au ticket.
   */
  private assertCanEdit(userId: string, userRole: Role, workOrder: { createdById: string }) {
    if (userRole === Role.MECHANIC && workOrder.createdById !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que les tickets que vous avez crees.');
    }
  }

  /**
   * Regle utilisee par updateStatus() : un MECHANIC ne peut faire avancer
   * le statut QUE du ticket qui lui est assigne (assignedMechanicId) --
   * avoir cree le ticket ne suffit pas. Tant qu'un Admin/Front Desk ne l'a
   * pas explicitement assigne, le mecanicien ne peut pas en changer le
   * statut, meme si c'est lui qui l'a ouvert. Le contenu du ticket
   * (update()) reste lui base sur assertCanEdit (createdById).
   */
  private assertCanChangeStatus(
    userId: string,
    userRole: Role,
    workOrder: { assignedMechanicId: string | null },
  ) {
    if (userRole === Role.MECHANIC && workOrder.assignedMechanicId !== userId) {
      throw new ForbiddenException('Vous ne pouvez changer le statut que des tickets qui vous sont assignes.');
    }
  }

  async update(
    garageId: string,
    userId: string,
    userRole: Role,
    id: string,
    dto: UpdateWorkOrderDto,
  ) {
    const workOrder = await this.getOwned(garageId, id);
    this.assertCanEdit(userId, userRole, workOrder);

    const { scheduledAt, ...rest } = dto;
    const data = { ...rest, ...(scheduledAt !== undefined ? { scheduledAt: new Date(scheduledAt) } : {}) };

    // Un deplacement/redimensionnement sur le calendrier n'envoie QUE
    // scheduledAt/estimatedMinutes : on le journalise comme une
    // replanification (plus lisible dans la timeline qu'un "modifie"
    // generique), avec l'ancien/nouveau creneau en metadata.
    const onlySchedule =
      Object.keys(rest).every((key) => key === 'estimatedMinutes') &&
      (scheduledAt !== undefined || dto.estimatedMinutes !== undefined);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({ where: { id }, data });

      await this.recordEvent(tx, {
        garageId,
        workOrderId: id,
        actorId: userId,
        category: ActivityCategory.GENERAL,
        ...(onlySchedule
          ? {
              type: 'WORK_ORDER_RESCHEDULED',
              message: 'Creneau du ticket replanifie',
              metadata: {
                old: { scheduledAt: workOrder.scheduledAt, estimatedMinutes: workOrder.estimatedMinutes },
                new: { scheduledAt: updated.scheduledAt, estimatedMinutes: updated.estimatedMinutes },
              },
            }
          : { type: 'WORK_ORDER_UPDATED', message: 'Informations du ticket modifiees' }),
      });

      return updated;
    });
  }

  /**
   * Endpoint dedie plutot qu'un champ `status` accepte par update() : un
   * changement de statut est un evenement metier a part entiere (Section
   * 30bis parle explicitement de tracabilite sur les changements
   * structurants d'un ticket), donc SENSITIVE plutot que GENERAL --
   * meme categorie que l'assignation d'un mecanicien (voir assign()).
   */
  async updateStatus(
    garageId: string,
    userId: string,
    userRole: Role,
    id: string,
    dto: UpdateWorkOrderStatusDto,
  ) {
    const workOrder = await this.getOwned(garageId, id);
    this.assertCanChangeStatus(userId, userRole, workOrder);

    if (workOrder.status === dto.status) {
      return workOrder;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id },
        data: { status: dto.status },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId: id,
        actorId: userId,
        type: 'STATUS_CHANGED',
        category: ActivityCategory.SENSITIVE,
        message: `Statut change : ${workOrder.status} -> ${dto.status}`,
        metadata: { field: 'status', old: workOrder.status, new: dto.status },
      });

      return updated;
    });
  }

  /**
   * Section 29 : assigner/reassigner un ticket est reserve a Admin/Front
   * Desk (RolesGuard cote controller) -- pas de verif d'ownership ici,
   * contrairement a update()/updateStatus().
   *
   * Le mecanicien cible doit exister, appartenir au MEME garage, et avoir
   * le role MECHANIC (on n'assigne pas un ticket a un Admin ou un client).
   */
  async assign(garageId: string, actorId: string, id: string, dto: AssignWorkOrderDto) {
    const workOrder = await this.getOwned(garageId, id);

    const mechanic = await this.prisma.user.findUnique({
      where: { id: dto.assignedMechanicId },
    });
    if (!mechanic || mechanic.garageId !== garageId || mechanic.role !== Role.MECHANIC) {
      throw new BadRequestException('Ce mecanicien est introuvable dans ce garage.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id },
        data: { assignedMechanicId: mechanic.id },
      });

      await this.recordEvent(tx, {
        garageId,
        workOrderId: id,
        actorId,
        type: 'MECHANIC_ASSIGNED',
        category: ActivityCategory.SENSITIVE,
        message: `Ticket assigne a ${mechanic.name}`,
        metadata: { field: 'assignedMechanicId', old: workOrder.assignedMechanicId, new: mechanic.id },
      });

      return updated;
    });
  }

  private recordEvent(
    client: EventWriter,
    event: {
      garageId: string;
      workOrderId: string;
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
