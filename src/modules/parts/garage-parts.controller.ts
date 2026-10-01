import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { PartsService } from './parts.service.js';

/** GET /parts : les pieces de tous les OR du garage (ecran Pieces > Suivi des OR). */
@Controller('parts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class GaragePartsController {
  constructor(private readonly partsService: PartsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.partsService.findAllForGarage(user.garageId as string);
  }
}
