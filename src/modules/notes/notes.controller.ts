import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreateNoteDto } from './dto/create-note.dto.js';
import { NotesService } from './notes.service.js';

/**
 * Imbrique sous /work-orders/:workOrderId/notes, meme schema que
 * PhotosController/TasksController -- une Note n'a de sens qu'attachee a
 * un ticket precis. Pas de route PATCH : voir NotesService.remove.
 */
@Controller('work-orders/:workOrderId/notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.notesService.findAllForWorkOrder(user.garageId as string, workOrderId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notesService.create(user.garageId as string, user.id, user.role, workOrderId, dto);
  }

  @Delete(':noteId')
  remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('noteId') noteId: string,
  ) {
    return this.notesService.remove(user.garageId as string, user.id, user.role, workOrderId, noteId);
  }
}
