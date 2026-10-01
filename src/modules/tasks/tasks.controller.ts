import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

/**
 * Imbrique sous /work-orders/:workOrderId/tasks, comme DiagnosisController
 * -- une Task n'a de sens qu'attachee a un ticket precis.
 * RolesGuard laisse passer les 3 roles garage-scoped ; TasksService
 * applique la restriction fine du Mecanicien (Section 20).
 */
@Controller('work-orders/:workOrderId/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.tasksService.findAllForWorkOrder(user.garageId as string, workOrderId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user.garageId as string, user.id, user.role, workOrderId, dto);
  }

  @Patch(':taskId')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      taskId,
      dto,
    );
  }

  @Delete(':taskId')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.remove(user.garageId as string, user.id, user.role, workOrderId, taskId);
  }
}
