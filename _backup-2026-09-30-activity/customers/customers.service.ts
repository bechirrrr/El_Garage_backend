import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @@unique([garageId, phone]) sur Customer empeche deja le doublon en
   * base, mais on prefere le detecter AVANT (findFirst) pour renvoyer un
   * ConflictException clair plutot que de laisser Prisma renvoyer une
   * P2002 brute -- meme logique que GaragesService.register.
   *
   * Un phone vide (undefined/null) ne declenche jamais ce check : Postgres
   * autorise plusieurs NULL malgre la contrainte unique, donc plusieurs
   * clients sans telephone dans le meme garage sont valides.
   */
  async create(garageId: string, dto: CreateCustomerDto) {
    if (dto.phone) {
      const existing = await this.prisma.customer.findUnique({
        where: { garageId_phone: { garageId, phone: dto.phone } },
      });
      if (existing) {
        throw new ConflictException('Un client avec ce numero de telephone existe deja.');
      }
    }

    return this.prisma.customer.create({
      data: {
        garageId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
      },
    });
  }

  /** Liste des clients du garage (Section 25) -- visible par tous les roles garage-scoped. */
  findAllForGarage(garageId: string) {
    return this.prisma.customer.findMany({
      where: { garageId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Inclut les vehicules du client : la fiche client doit montrer "Customer
   * Vehicles" (Section 25) sans requete separee cote frontend.
   *
   * garageId vient toujours de req.user (jamais de l'URL) -- si l'id existe
   * mais appartient a un AUTRE garage, on renvoie NotFoundException plutot
   * que de reveler son existence (meme logique que InvitationsService).
   */
  async findOne(garageId: string, id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { vehicles: { orderBy: { createdAt: 'desc' } } },
    });
    if (!customer || customer.garageId !== garageId) {
      throw new NotFoundException('Client introuvable.');
    }
    return customer;
  }

  async update(garageId: string, id: string, dto: UpdateCustomerDto) {
    await this.findOne(garageId, id); // 404 si absent ou hors garage

    if (dto.phone) {
      const existing = await this.prisma.customer.findUnique({
        where: { garageId_phone: { garageId, phone: dto.phone } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Un client avec ce numero de telephone existe deja.');
      }
    }

    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  /**
   * Delete reserve a l'Admin (RolesGuard cote controller) : ni le Mecanicien
   * ni le Front Desk ne peuvent supprimer un client (Section 29).
   *
   * Vehicle.customer est en onDelete: Restrict -- si le client a encore des
   * vehicules, Prisma refuse la suppression (P2003). On traduit ça en
   * message clair plutot que de laisser filtrer une erreur Postgres brute.
   */
  async remove(garageId: string, id: string) {
    await this.findOne(garageId, id);

    try {
      return await this.prisma.customer.delete({ where: { id } });
    } catch (error: any) {
      if (error?.code === 'P2003') {
        throw new ConflictException(
          'Impossible de supprimer un client qui a encore des vehicules associes.',
        );
      }
      throw error;
    }
  }
}
