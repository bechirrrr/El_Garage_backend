import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreatePhotoDto } from './dto/create-photo.dto.js';
import { PhotosService } from './photos.service.js';

/**
 * Imbrique sous /work-orders/:workOrderId/photos, meme schema que
 * TasksController/PartsController -- une Photo n'a de sens qu'attachee a
 * un ticket precis. Pas de route PATCH : voir PhotosService.remove.
 */
@Controller('work-orders/:workOrderId/photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.photosService.findAllForWorkOrder(user.garageId as string, workOrderId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreatePhotoDto,
  ) {
    return this.photosService.create(user.garageId as string, user.id, user.role, workOrderId, dto);
  }

  @Delete(':photoId')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photosService.remove(user.garageId as string, user.id, user.role, workOrderId, photoId);
  }
}
