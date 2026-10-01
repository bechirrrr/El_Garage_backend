import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Meme regle d'ownership que DiagnosisService/WorkOrdersService (Section
   * 20) -- dupliquee volontairement ici plutot que factorisee entre
   * modules, voir la note dans DiagnosisService.getEditableWorkOrder.
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

  /** Si assignedMechanicId est fourni, il doit pointer vers un MECHANIC du meme garage. */
  private async assertValidAssignee(garageId: string, assignedMechanicId: string | undefined) {
    if (!assignedMechanicId) {
      return;
    }
    const mechanic = await this.prisma.user.findUnique({ where: { id: assignedMechanicId } });
    if (!mechanic || mechanic.garageId !== garageId || mechanic.role !== Role.MECHANIC) {
      throw new BadRequestException('Ce mecanicien est introuvable dans ce garage.');
    }
  }

  /** Lecture ouverte aux 3 roles garage-scoped (visibilite, Section 20). */
  async findAllForWorkOrder(garageId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }

    return this.prisma.task.findMany({
      where: { workOrderId },
      include: { assignedMechanic: { select: { id: true, name: true } } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Pas d'ActivityEvent ici, volontairement : une Task est un element de
   * checklist (comme Symptom/DiagnosticTest sur Diagnosis) -- meme decision
   * que DiagnosisService pour ne pas noyer la timeline du ticket dans du
   * bruit a chaque case cochee/tache ajoutee.
   */
  async create(garageId: string, userId: string, userRole: Role, workOrderId: string, dto: CreateTaskDto) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    await this.assertValidAssignee(garageId, dto.assignedMechanicId);

    return this.prisma.task.create({ data: { garageId, workOrderId, ...dto } });
  }

  private async getOwnedTask(workOrderId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.workOrderId !== workOrderId) {
      throw new NotFoundException('Tache introuvable.');
    }
    return task;
  }

  async update(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    await this.getOwnedTask(workOrderId, taskId);
    await this.assertValidAssignee(garageId, dto.assignedMechanicId);

    return this.prisma.task.update({ where: { id: taskId }, data: dto });
  }

  async remove(garageId: string, userId: string, userRole: Role, workOrderId: string, taskId: string) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);
    await this.getOwnedTask(workOrderId, taskId);

    return this.prisma.task.delete({ where: { id: taskId } });
  }
}
