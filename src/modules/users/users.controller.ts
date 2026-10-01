import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { UsersService } from './users.service.js';

/**
 * GET : ADMIN/FRONT_DESK (gestion d'equipe pour l'Admin, picker de
 * mecanicien pour assigner un WorkOrder pour les deux -- voir
 * WorkOrdersController.assign). POST / PATCH (creer un membre sans
 * invitation, changer son role, le desactiver) : ADMIN uniquement.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.findAllForGarage(user.garageId as string);
  }

  /** Fiche d'un membre avec son activite (ecran Equipe). */
  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.usersService.findOneWithActivity(user.garageId as string, id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.garageId as string, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.usersService.update(user.garageId as string, user.id, id, dto);
  }
}
