import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { UsersService } from './users.service.js';

/**
 * Reserve a ADMIN/FRONT_DESK : ce sont les deux roles qui ont besoin de
 * voir la liste des membres (gestion d'equipe pour l'Admin, picker de
 * mecanicien pour assigner un WorkOrder pour les deux -- voir
 * WorkOrdersController.assign). Un MECHANIC n'a pas besoin de cette liste
 * aujourd'hui ; a rouvrir si un besoin concret apparait.
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
}
