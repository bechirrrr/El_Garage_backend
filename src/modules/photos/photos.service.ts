import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePhotoDto } from './dto/create-photo.dto.js';

@Injectable()
export class PhotosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Meme regle d'ownership que TasksService/PartsService (Section 20) --
   * dupliquee volontairement plutot que factorisee, voir la note dans
   * DiagnosisService.getEditableWorkOrder.
   */
  private async getEditableWorkOrder(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
  ) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }
    if (userRole === Role.MECHANIC && workOrder.createdById !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que les tickets que vous avez crees.');
    }
    return workOrder;
  }

  /** Lecture ouverte aux 3 roles garage-scoped (visibilite, Section 20). */
  async findAllForWorkOrder(garageId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }

    return this.prisma.photo.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Pas d'ActivityEvent dedie ici : l'exemple de la Section 17 mentionne
   * "09:30 Photos added" au niveau narratif, mais on reste coherent avec
   * Task/Part/Symptom -- l'ajout d'une photo est un element de contenu,
   * pas un evenement de statut/prix (Section 30bis). A rouvrir si
   * l'utilisateur veut vraiment voir chaque photo dans la timeline.
   */
  async create(garageId: string, userId: string, userRole: Role, workOrderId: string, dto: CreatePhotoDto) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);

    return this.prisma.photo.create({
      data: { garageId, workOrderId, uploadedById: userId, ...dto },
    });
  }

  private async getOwnedPhoto(workOrderId: string, photoId: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.workOrderId !== workOrderId) {
      throw new NotFoundException('Photo introuvable.');
    }
    return photo;
  }

  /**
   * Pas d'update : une Photo est immuable une fois postee (voir
   * photo.prisma). Seule la suppression est permise, pour corriger un
   * upload par erreur -- une correction de contenu passe par delete + un
   * nouvel upload, jamais une modification sur place.
   */
  async remove(garageId: string, userId: string, userRole: Role, workOrderId: string, photoId: string) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    await this.getOwnedPhoto(workOrderId, photoId);

    return this.prisma.photo.delete({ where: { id: photoId } });
  }
}
