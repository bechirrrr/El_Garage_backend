import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreatePartDto } from './dto/create-part.dto.js';
import { UpdatePartDto } from './dto/update-part.dto.js';
import { PartsService } from './parts.service.js';

/**
 * Imbrique sous /work-orders/:workOrderId/parts, meme schema que
 * TasksController/DiagnosisController -- une Part n'a de sens qu'attachee
 * a un ticket precis. RolesGuard laisse passer les 3 roles garage-scoped ;
 * PartsService applique la restriction fine du Mecanicien (Section 20).
 */
@Controller('work-orders/:workOrderId/parts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.partsService.findAllForWorkOrder(user.garageId as string, workOrderId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreatePartDto,
  ) {
    return this.partsService.create(user.garageId as string, user.id, user.role, workOrderId, dto);
  }

  @Patch(':partId')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('partId') partId: string,
    @Body() dto: UpdatePartDto,
  ) {
    return this.partsService.update(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      partId,
      dto,
    );
  }

  @Delete(':partId')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('partId') partId: string,
  ) {
    return this.partsService.remove(user.garageId as string, user.id, user.role, workOrderId, partId);
  }
}
