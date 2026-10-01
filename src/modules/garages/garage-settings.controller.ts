import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { UpdateGarageSettingsDto } from './dto/update-garage-settings.dto.js';
import { GarageSettingsService } from './garage-settings.service.js';

/**
 * Parametres du garage de l'utilisateur connecte.
 * GET : tous les membres (horaires, capacite, duree par defaut, TVA...).
 * PATCH : ADMIN seulement.
 */
@Controller('garage-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GarageSettingsController {
  constructor(private readonly settings: GarageSettingsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  find(@CurrentUser() user: CurrentUserPayload) {
    return this.settings.find(user.garageId as string);
  }

  @Patch()
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateGarageSettingsDto) {
    return this.settings.update(user.garageId as string, user.id, dto);
  }
}
