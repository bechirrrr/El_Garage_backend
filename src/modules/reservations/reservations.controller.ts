import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { ConvertReservationDto } from './dto/convert-reservation.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto.js';
import { UpdateReservationDto } from './dto/update-reservation.dto.js';
import { ReservationsService } from './reservations.service.js';

/**
 * PAS imbrique sous /work-orders (contrairement a Diagnosis/Task/Part/
 * Photo/Note/Invoice) : une Reservation existe AVANT tout WorkOrder --
 * c'est la porte d'entree optionnelle du calendrier (Section 33), pas une
 * sous-ressource d'un ticket.
 *
 * @Roles au niveau controller autorise les 3 roles garage-scoped en
 * lecture (le Mecanicien ne voit que ses propres rendez-vous assignes,
 * filtre dans ReservationsService) ; chaque route d'ecriture redefinit
 * @Roles(ADMIN, FRONT_DESK) pour exclure le Mecanicien (Section 33 :
 * "view only" pour lui). getAllAndOverride() sur RolesGuard fait qu'un
 * @Roles() au niveau methode remplace entierement celui du controller.
 */
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.reservationsService.findAllForGarage(user.garageId as string, user.id, user.role);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.reservationsService.findOne(user.garageId as string, user.id, user.role, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user.garageId as string, user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(user.garageId as string, id, dto, user.id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.reservationsService.updateStatus(user.garageId as string, id, dto, user.id);
  }

  @Post(':id/convert')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  convert(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ConvertReservationDto,
  ) {
    return this.reservationsService.convert(user.garageId as string, user.id, id, dto);
  }
}
