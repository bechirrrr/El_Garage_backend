import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { GarageStatus, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RegisterGarageDto } from './dto/register-garage.dto.js';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class GaragesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * L'Admin qui s'inscrit cree son Garage en meme temps que son propre
   * compte (Section 4) -- les deux doivent reussir ensemble ou pas du tout,
   * d'ou la transaction Prisma.
   *
   * Ne retourne PAS de token JWT : la connexion est le role du futur
   * module Auth, pas de celui-ci. Apres inscription, l'Admin devra se
   * connecter separement, et tombera sur l'ecran "Awaiting Approval" tant
   * que l'Owner n'a pas approuve le Garage (status reste PENDING_APPROVAL).
   */
  async register(dto: RegisterGarageDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
    });
    if (existing) {
      throw new ConflictException('Un compte existe deja avec cet email.');
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, BCRYPT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const garage = await tx.garage.create({
        data: {
          name: dto.garageName,
          phone: dto.garagePhone,
          address: dto.garageAddress,
          status: GarageStatus.PENDING_APPROVAL,
        },
      });

      const admin = await tx.user.create({
        data: {
          garageId: garage.id,
          email: dto.adminEmail,
          name: dto.adminName,
          role: Role.ADMIN,
          passwordHash,
        },
      });

      // On ne renvoie jamais le hash du mot de passe, meme dans la reponse
      // de l'API qui vient de le creer.
      const { passwordHash: _omit, ...adminWithoutPassword } = admin;
      return { garage, admin: adminWithoutPassword };
    });
  }

  /** Owner Console (Section 28) : tous les garages, tous statuts confondus. */
  findAll() {
    return this.prisma.garage.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const garage = await this.prisma.garage.findUnique({ where: { id } });
    if (!garage) {
      throw new NotFoundException('Garage introuvable.');
    }
    return garage;
  }

  /**
   * Les 4 transitions de statut possibles pour l'Owner (Section 28)
   * partagent la meme mecanique -- on la factorise ici plutot que de la
   * repeter 4 fois.
   */
  private async setStatus(id: string, status: GarageStatus, reviewedById: string) {
    await this.findOne(id); // leve NotFoundException si le garage n'existe pas

    return this.prisma.garage.update({
      where: { id },
      data: { status, reviewedById, reviewedAt: new Date() },
    });
  }

  approve(id: string, ownerId: string) {
    return this.setStatus(id, GarageStatus.ACTIVE, ownerId);
  }

  reject(id: string, ownerId: string) {
    return this.setStatus(id, GarageStatus.REJECTED, ownerId);
  }

  suspend(id: string, ownerId: string) {
    return this.setStatus(id, GarageStatus.SUSPENDED, ownerId);
  }

  async reactivate(id: string, ownerId: string) {
    const garage = await this.findOne(id);
    if (garage.status !== GarageStatus.SUSPENDED) {
      throw new BadRequestException('Seul un garage SUSPENDED peut etre reactive.');
    }
    return this.setStatus(id, GarageStatus.ACTIVE, ownerId);
  }
}
