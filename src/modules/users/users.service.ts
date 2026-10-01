import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InvitationStatus, Role, WorkOrderStatus } from '../../generated/prisma/client.js';
import { PHONE_PATTERN, normalizePhone } from '../../common/phone.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';

const BCRYPT_ROUNDS = 10;

/** Champs renvoyes pour un membre -- jamais passwordHash ni googleId, meme a un Admin. */
const MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roster de l'equipe du garage (Section 5/18 -- "View all Mechanics") et
   * source du picker d'assignation d'un WorkOrder (Section 29), avec le
   * nombre d'OR en cours (non termines) assignes a chaque membre.
   */
  async findAllForGarage(garageId: string) {
    const users = await this.prisma.user.findMany({
      where: { garageId },
      select: {
        ...MEMBER_SELECT,
        _count: { select: { workOrdersAssigned: { where: { status: { not: WorkOrderStatus.COMPLETED } } } } },
      },
      orderBy: { name: 'asc' },
    });
    return users.map(({ _count, ...user }) => ({ ...user, openWorkOrders: _count.workOrdersAssigned }));
  }

  /**
   * Fiche d'un membre (ecran Equipe -> clic sur un membre) : son profil, ses
   * chiffres et ce qu'il a fait dans l'appli. "Ses actions" = les
   * ActivityEvent dont il est l'auteur : OR (statuts, assignations,
   * diagnostic, factures, paiements...) mais aussi clients, vehicules et
   * rendez-vous (voir common/activity-log.ts), les 100 plus recents, avec
   * l'objet concerne.
   * Reserve a l'ADMIN (le controller le garantit) : il voit aussi les
   * evenements SENSITIVE, comme dans la fiche OR.
   */
  async findOneWithActivity(garageId: string, id: string) {
    const member = await this.prisma.user.findUnique({ where: { id }, select: { ...MEMBER_SELECT, garageId: true } });
    if (!member || member.garageId !== garageId) {
      throw new NotFoundException('Membre introuvable.');
    }

    const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [activity, workOrders, openWorkOrders, completedWorkOrders, actionsLast30Days] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where: { garageId, actorId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          workOrder: {
            select: { id: true, number: true, vehicle: { select: { make: true, model: true, plate: true } } },
          },
          customer: { select: { id: true, name: true } },
          vehicle: { select: { id: true, make: true, model: true, plate: true } },
          reservation: { select: { id: true, scheduledAt: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { garageId, assignedMechanicId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          number: true,
          status: true,
          priority: true,
          problemReported: true,
          createdAt: true,
          updatedAt: true,
          vehicle: { select: { make: true, model: true, plate: true } },
          customer: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.count({
        where: { garageId, assignedMechanicId: id, status: { not: WorkOrderStatus.COMPLETED } },
      }),
      this.prisma.workOrder.count({
        where: { garageId, assignedMechanicId: id, status: WorkOrderStatus.COMPLETED },
      }),
      this.prisma.activityEvent.count({ where: { garageId, actorId: id, createdAt: { gte: since30Days } } }),
    ]);

    const { garageId: _garage, ...profile } = member;
    return {
      ...profile,
      stats: {
        openWorkOrders,
        completedWorkOrders,
        actionsLast30Days,
        lastActivityAt: activity[0]?.createdAt ?? null,
      },
      activity,
      workOrders,
    };
  }

  /**
   * Creation directe d'un membre par l'Admin (sans invitation) : le compte
   * est actif tout de suite, avec un mot de passe provisoire que le membre
   * devra changer a sa premiere connexion (mustChangePassword).
   */
  async create(garageId: string, dto: CreateUserDto) {
    // Meme convention que les invitations et le login : l'email est garde tel que saisi.
    const email = dto.email?.trim() || null;
    const phone = dto.phone?.trim() ? normalizePhone(dto.phone) : null;
    if (!email && !phone) {
      throw new BadRequestException('Renseignez un email ou un numero de telephone : il sert a se connecter.');
    }
    if (phone && !PHONE_PATTERN.test(phone)) {
      throw new BadRequestException('Numero de telephone invalide (8 a 15 chiffres).');
    }

    if (email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException('Un compte existe deja avec cet email.');
    }
    if (phone && (await this.prisma.user.findUnique({ where: { phone } }))) {
      throw new ConflictException('Un compte existe deja avec ce numero de telephone.');
    }

    if (email) {
      const invitation = await this.prisma.invitation.findUnique({
        where: { garageId_email: { garageId, email } },
      });
      if (invitation && invitation.status === InvitationStatus.PENDING && invitation.expiresAt > new Date()) {
        throw new ConflictException(
          'Une invitation est deja en attente pour cet email. Revoquez-la avant de creer le compte.',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: {
        garageId,
        email,
        phone,
        name: dto.name.trim(),
        role: dto.role,
        passwordHash,
        mustChangePassword: true,
      },
      select: MEMBER_SELECT,
    });
  }

  /**
   * Changer le role (Mecanicien <-> Accueil) ou activer / desactiver un
   * membre. Jamais sur soi-meme (un Admin ne peut pas se retirer ses propres
   * droits par erreur) ni sur un autre ADMIN / OWNER. Un compte desactive
   * est coupe immediatement : JwtStrategy relit isActive a chaque requete.
   */
  async update(garageId: string, currentUserId: string, id: string, dto: UpdateMemberDto) {
    if (dto.role === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Rien a modifier.');
    }
    if (id === currentUserId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre compte ici.');
    }

    const member = await this.prisma.user.findUnique({ where: { id } });
    // Un membre d'un autre garage est traite comme introuvable (meme logique que GarageScopeGuard).
    if (!member || member.garageId !== garageId) {
      throw new NotFoundException('Membre introuvable.');
    }
    if (member.role === Role.ADMIN || member.role === Role.OWNER) {
      throw new ForbiddenException("Le compte d'un administrateur ne peut pas etre modifie ici.");
    }

    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role, isActive: dto.isActive },
      select: MEMBER_SELECT,
    });
  }
}
