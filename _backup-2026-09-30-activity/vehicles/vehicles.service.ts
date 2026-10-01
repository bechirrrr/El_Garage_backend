import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tous les roles garage-scoped peuvent creer (Section 19/29), donc aucune
   * verification de role ici -- seulement des verifications de donnees :
   * 1) le customerId fourni doit exister ET appartenir au MEME garage
   *    (sinon un Front Desk pourrait rattacher un vehicule au client d'un
   *    autre garage par erreur ou en devinant un id) ;
   * 2) plate unique DANS le garage, vin unique GLOBALEMENT (memes regles
   *    que les contraintes @@unique/@unique du schema Prisma).
   */
  async create(garageId: string, createdById: string, dto: CreateVehicleDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || customer.garageId !== garageId) {
      throw new NotFoundException('Client introuvable dans ce garage.');
    }

    const existingPlate = await this.prisma.vehicle.findUnique({
      where: { garageId_plate: { garageId, plate: dto.plate } },
    });
    if (existingPlate) {
      throw new ConflictException('Un vehicule avec cette plaque existe deja dans ce garage.');
    }

    if (dto.vin) {
      const existingVin = await this.prisma.vehicle.findUnique({ where: { vin: dto.vin } });
      if (existingVin) {
        throw new ConflictException('Ce VIN est deja associe a un autre vehicule.');
      }
    }

    return this.prisma.vehicle.create({
      data: {
        garageId,
        createdById,
        customerId: dto.customerId,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        plate: dto.plate,
        vin: dto.vin,
        mileage: dto.mileage,
        fuelType: dto.fuelType,
        engineSize: dto.engineSize,
        transmission: dto.transmission,
      },
    });
  }

  /** Vue liste (Section 21 Workshop Overview / Section 25) : visible par tous les roles garage-scoped. */
  findAllForGarage(garageId: string) {
    return this.prisma.vehicle.findMany({
      where: { garageId },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(garageId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });
    if (!vehicle || vehicle.garageId !== garageId) {
      throw new NotFoundException('Vehicule introuvable.');
    }
    return vehicle;
  }

  /**
   * Fetch "brut" (sans include) reserve a l'usage interne (ownership check,
   * pre-update) -- findOne() ci-dessus est la version "affichage" avec les
   * relations chargees.
   */
  private async getOwned(garageId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle || vehicle.garageId !== garageId) {
      throw new NotFoundException('Vehicule introuvable.');
    }
    return vehicle;
  }

  /**
   * Regle cle de la Section 20 (Visibility vs Modification) :
   * un Mecanicien ne peut modifier QUE les vehicules qu'il a lui-meme crees
   * (createdById), alors qu'Admin et Front Desk peuvent modifier n'importe
   * lequel. RolesGuard cote controller autorise deja les 3 roles a appeler
   * cette route -- c'est ICI, au niveau donnee, que la restriction fine du
   * Mecanicien se joue.
   */
  async update(
    garageId: string,
    userId: string,
    userRole: Role,
    id: string,
    dto: UpdateVehicleDto,
  ) {
    const vehicle = await this.getOwned(garageId, id);

    if (userRole === Role.MECHANIC && vehicle.createdById !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que les vehicules que vous avez crees.');
    }

    if (dto.plate && dto.plate !== vehicle.plate) {
      const existingPlate = await this.prisma.vehicle.findUnique({
        where: { garageId_plate: { garageId, plate: dto.plate } },
      });
      if (existingPlate && existingPlate.id !== id) {
        throw new ConflictException('Un vehicule avec cette plaque existe deja dans ce garage.');
      }
    }

    if (dto.vin && dto.vin !== vehicle.vin) {
      const existingVin = await this.prisma.vehicle.findUnique({ where: { vin: dto.vin } });
      if (existingVin && existingVin.id !== id) {
        throw new ConflictException('Ce VIN est deja associe a un autre vehicule.');
      }
    }

    return this.prisma.vehicle.update({ where: { id }, data: dto });
  }

  /**
   * Delete reserve a l'Admin (RolesGuard + @Roles(Role.ADMIN) cote
   * controller, ni Front Desk ni Mecanicien -- Section 20/29). WorkOrder et
   * Reservation pointent vers Vehicle en onDelete: Restrict : si le
   * vehicule a un historique, Prisma refuse (P2003).
   */
  async remove(garageId: string, id: string) {
    await this.getOwned(garageId, id);

    try {
      return await this.prisma.vehicle.delete({ where: { id } });
    } catch (error: any) {
      if (error?.code === 'P2003') {
        throw new ConflictException(
          'Impossible de supprimer un vehicule qui a des reparations ou reservations associees.',
        );
      }
      throw error;
    }
  }
}
