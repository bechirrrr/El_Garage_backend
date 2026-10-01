import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WorkOrderStatus } from '../../generated/prisma/client.js';

/**
 * GET /tasks/mine -- tableau de bord du mecanicien : ses taches sur tous ses
 * OR non termines. Une tache "est a lui" si elle lui est assignee, ou si
 * elle n'est assignee a personne et que l'OR lui est assigne.
 * Lecture seule (la modification reste sur /work-orders/:id/tasks).
 */
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MyTasksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('mine')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.prisma.task.findMany({
      where: {
        garageId: user.garageId as string,
        workOrder: { status: { not: WorkOrderStatus.COMPLETED } },
        OR: [
          { assignedMechanicId: user.id },
          { assignedMechanicId: null, workOrder: { assignedMechanicId: user.id } },
        ],
      },
      include: {
        workOrder: {
          select: { id: true, number: true, vehicle: { select: { make: true, model: true, plate: true } } },
        },
      },
      orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    });
  }
}
