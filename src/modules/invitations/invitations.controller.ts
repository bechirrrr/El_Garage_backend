import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { InvitationsService } from './invitations.service.js';

/**
 * Contrairement a GaragesController (/garages/:id), pas besoin de
 * GarageScopeGuard ici : il n'y a pas de garageId dans l'URL a comparer.
 * Un ADMIN agit toujours sur SON PROPRE garage, deduit de req.user.garageId
 * -- jamais d'un parametre fourni par le client. C'est plus simple ET plus
 * sur : rien a verifier, il n'y a qu'un seul garage possible.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // --- Cote Admin, protege ---

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateInvitationDto) {
    return this.invitationsService.create(user.garageId as string, user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.invitationsService.findAllForGarage(user.garageId as string);
  }

  @Patch(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  revoke(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.invitationsService.revoke(user.garageId as string, id);
  }

  // --- Public : l'invite n'a pas encore de compte, donc pas de JWT ---

  @Get('by-token/:token')
  preview(@Param('token') token: string) {
    return this.invitationsService.preview(token);
  }

  @Post('by-token/:token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitationsService.accept(token, dto);
  }
}
