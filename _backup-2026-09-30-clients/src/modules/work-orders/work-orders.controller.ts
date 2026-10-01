import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { AssignWorkOrderDto } from './dto/assign-work-order.dto.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto.js';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import { WorkOrdersService } from './work-orders.service.js';

/**
 * Permissions (Sections 18-20-29) :
 *  - Create        : ADMIN, FRONT_DESK, MECHANIC (tous les roles garage-scoped)
 *  - Read           : tous les roles garage-scoped, TOUS les tickets (pas
 *    seulement les siens -- "View Work Order (all)")
 *  - Update (contenu)  : tous les roles garage-scoped, mais un MECHANIC
 *    est restreint aux tickets qu'il a lui-meme crees -- verifie dans
 *    WorkOrdersService, pas par RolesGuard (qui ne voit pas la donnee).
 *  - Update (status)    : tous les roles garage-scoped, mais un MECHANIC
 *    est restreint au ticket qui lui est ASSIGNE (assignedMechanicId) --
 *    avoir cree le ticket ne suffit pas, il doit avoir ete assigne par un
 *    Admin/Front Desk avant de pouvoir en faire avancer le statut.
 *  - Assign        : ADMIN, FRONT_DESK uniquement (jamais MECHANIC).
 *  - Delete        : volontairement absent. Un ticket porte l'historique
 *    financier/reparation du vehicule (Invoice, ActivityEvent...) -- rien
 *    dans la spec n'evoque sa suppression, et l'esprit general (Section
 *    30bis : "rien n'est silencieux, rien ne s'efface") va plutot dans le
 *    sens contraire. A rouvrir explicitement si le besoin se confirme.
 */
@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(user.garageId as string, user.id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.workOrdersService.findAllForGarage(user.garageId as string);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.workOrdersService.findOne(user.garageId as string, user.id, user.role, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.workOrdersService.update(user.garageId as string, user.id, user.role, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderStatusDto,
  ) {
    return this.workOrdersService.updateStatus(
      user.garageId as string,
      user.id,
      user.role,
      id,
      dto,
    );
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  assign(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AssignWorkOrderDto,
  ) {
    return this.workOrdersService.assign(user.garageId as string, user.id, id, dto);
  }
}
