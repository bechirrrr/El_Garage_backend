import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GarageScopeGuard } from '../../common/guards/garage-scope.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { RegisterGarageDto } from './dto/register-garage.dto.js';
import { GaragesService } from './garages.service.js';

/**
 * Toutes les routes ci-dessous (sauf /register, publique par definition)
 * sont maintenant reellement protegees : JwtAuthGuard s'execute TOUJOURS
 * en premier dans @UseGuards(...) et pose req.user, que RolesGuard /
 * GarageScopeGuard lisent ensuite pour autoriser ou bloquer la requete.
 */
@Controller('garages')
export class GaragesController {
  constructor(private readonly garagesService: GaragesService) {}

  @Post('register')
  register(@Body() dto: RegisterGarageDto) {
    return this.garagesService.register(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  findAll() {
    return this.garagesService.findAll();
  }

  @Get(':id')
  // new GarageScopeGuard() (instance), pas la classe : son constructeur
  // prend un `paramName: string` simple (pas un service injectable), donc
  // Nest ne peut pas le resoudre via DI si on lui passe la classe (erreur
  // "Nest can't resolve dependencies ... argument String" -- non couverte
  // par les tests unitaires, qui instancient toujours le guard a la main).
  @UseGuards(JwtAuthGuard, new GarageScopeGuard())
  findOne(@Param('id') id: string) {
    return this.garagesService.findOne(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.garagesService.approve(id, user.id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  reject(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.garagesService.reject(id, user.id);
  }

  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  suspend(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.garagesService.suspend(id, user.id);
  }

  @Patch(':id/reactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  reactivate(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.garagesService.reactivate(id, user.id);
  }
}
