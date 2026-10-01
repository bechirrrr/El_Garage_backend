import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehiclesService } from './vehicles.service.js';

/**
 * Permissions (Section 19/20/29) :
 *  - Create : ADMIN, FRONT_DESK, MECHANIC (tous les roles garage-scoped)
 *  - Read   : tous les roles garage-scoped
 *  - Update : tous les roles garage-scoped, mais RolesGuard ne suffit pas
 *    a lui seul pour le Mecanicien -- VehiclesService.update() verifie en
 *    plus qu'il est bien le createdById si son role est MECHANIC.
 *  - Delete : ADMIN uniquement.
 */
@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(user.garageId as string, user.id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.vehiclesService.findAllForGarage(user.garageId as string);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.vehiclesService.findOne(user.garageId as string, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(user.garageId as string, user.id, user.role, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.vehiclesService.remove(user.garageId as string, id);
  }
}
