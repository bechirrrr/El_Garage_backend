import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { InvitationStatus } from '../../generated/prisma/client.js';
import { MailService } from '../../mail/mail.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';

const BCRYPT_ROUNDS = 10;
const INVITATION_EXPIRY_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Un ADMIN invite un Mecanicien ou un Front Desk dans SON garage
   * (garageId vient de req.user, jamais du corps de la requete -- on ne
   * fait jamais confiance au client pour dire "dans quel garage" agir).
   *
   * upsert plutot que create : si une invitation existait deja pour cet
   * email dans ce garage (ex: REVOKED ou EXPIRED), on la reactive au lieu
   * de forcer l'Admin a d'abord la supprimer -- @@unique([garageId, email])
   * sur Invitation rend ca possible directement.
   */
  async create(garageId: string, invitedById: string, dto: CreateInvitationDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Un compte existe deja avec cet email.');
    }

    const pending = await this.prisma.invitation.findUnique({
      where: { garageId_email: { garageId, email: dto.email } },
    });
    // Une invitation PENDING mais deja expiree ne bloque pas : on la reactive (bouton "Reinviter").
    if (pending && pending.status === InvitationStatus.PENDING && pending.expiresAt > new Date()) {
      throw new ConflictException('Une invitation est deja en attente pour cet email.');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.upsert({
      where: { garageId_email: { garageId, email: dto.email } },
      create: {
        garageId,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        token,
        expiresAt,
        invitedById,
      },
      update: {
        name: dto.name,
        role: dto.role,
        token,
        expiresAt,
        status: InvitationStatus.PENDING,
        invitedById,
        acceptedAt: null,
      },
    });

    const garage = await this.prisma.garage.findUnique({ where: { id: garageId } });
    // On attend l'envoi (await) pour que les erreurs SMTP finissent dans les
    // logs au bon moment, mais sendMail() n'echoue jamais lui-meme (voir
    // MailService) -- un probleme d'email ne fait donc jamais echouer cette
    // methode ni la requete HTTP qui l'a appelee.
    await this.mailService.sendInvitationEmail({
      to: invitation.email,
      name: invitation.name,
      garageName: garage?.name ?? 'El Garage',
      token: invitation.token,
    });

    return invitation;
  }

  /** Ecran "invitations en cours" de l'Admin (Section 18). */
  findAllForGarage(garageId: string) {
    return this.prisma.invitation.findMany({
      where: { garageId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(garageId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });

    // Meme si l'id existe, on la traite comme "introuvable" si elle
    // appartient a un AUTRE garage -- ne jamais reveler qu'une invitation
    // d'un garage tiers existe, c'est la meme logique que GarageScopeGuard.
    if (!invitation || invitation.garageId !== garageId) {
      throw new NotFoundException('Invitation introuvable.');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Seule une invitation PENDING peut etre revoquee.');
    }

    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });
  }

  /** Public (pas de JWT : l'invite n'a pas encore de compte) : previsualise l'invitation avant de demander un mot de passe. */
  async preview(token: string) {
    const invitation = await this.findValidPendingInvitation(token);
    const garage = await this.prisma.garage.findUnique({ where: { id: invitation.garageId } });

    return {
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      garageName: garage?.name ?? null,
    };
  }

  /** Public : transforme une invitation valide en compte User reel. */
  async accept(token: string, dto: AcceptInvitationDto) {
    const invitation = await this.findValidPendingInvitation(token);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          garageId: invitation.garageId,
          email: invitation.email,
          name: invitation.name,
          role: invitation.role,
          passwordHash,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });

      const { passwordHash: _omit, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  private async findValidPendingInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) {
      throw new NotFoundException('Invitation introuvable.');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException("Cette invitation n'est plus valide.");
    }
    if (invitation.expiresAt < new Date()) {
      // On marque EXPIRED au passage plutot que d'avoir besoin d'un job
      // cron dedie juste pour ce changement de statut : le prochain acces
      // au token (preview ou accept) le detecte et corrige l'etat.
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BadRequestException('Cette invitation a expire.');
    }
    return invitation;
  }
}
