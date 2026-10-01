import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateNoteDto } from './dto/create-note.dto.js';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Meme regle d'ownership que PhotosService/TasksService (Section 20) --
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

  /**
   * Lecture ouverte aux 3 roles garage-scoped (visibilite, Section 20).
   * Inclut l'auteur (id+name) -- comme WorkOrdersService/TasksService
   * incluent leurs relations d'affichage, une Note sans nom d'auteur
   * n'aurait qu'un authorId illisible cote client.
   */
  async findAllForWorkOrder(garageId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }

    return this.prisma.note.findMany({
      where: { workOrderId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Pas d'ActivityEvent dedie : meme decision que pour Photo (Section 17
   * narratif vs 30bis structure) -- une Note est un element de contenu
   * ecrit par un humain, pas un evenement systeme. A rouvrir si besoin.
   */
  async create(garageId: string, userId: string, userRole: Role, workOrderId: string, dto: CreateNoteDto) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);

    return this.prisma.note.create({
      data: { garageId, workOrderId, authorId: userId, ...dto },
    });
  }

  private async getOwnedNote(workOrderId: string, noteId: string) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note || note.workOrderId !== workOrderId) {
      throw new NotFoundException('Note introuvable.');
    }
    return note;
  }

  /**
   * Pas d'update : une Note est append-only (voir note.prisma). La
   * suppression reste possible pour corriger une entree ajoutee par
   * erreur, mais une correction de contenu doit passer par une nouvelle
   * Note, jamais une modification sur place.
   */
  async remove(garageId: string, userId: string, userRole: Role, workOrderId: string, noteId: string) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    await this.getOwnedNote(workOrderId, noteId);

    return this.prisma.note.delete({ where: { id: noteId } });
  }
}
