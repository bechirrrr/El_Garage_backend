import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { DiagnosisService } from './diagnosis.service.js';
import { CreateDiagnosticTestDto } from './dto/create-diagnostic-test.dto.js';
import { CreateSymptomDto } from './dto/create-symptom.dto.js';
import { UpdateDiagnosticTestDto } from './dto/update-diagnostic-test.dto.js';
import { UpdateSymptomDto } from './dto/update-symptom.dto.js';
import { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto.js';

/**
 * Route imbriquee sous /work-orders/:workOrderId/diagnosis plutot qu'une
 * ressource /diagnoses independante : Diagnosis n'a de sens qu'attache a UN
 * ticket precis (1-1), jamais consulte ou liste seul.
 *
 * Lecture ouverte aux 3 roles garage-scoped (visibilite, Section 20).
 * Ecriture (upsert + checklists) : verifiee au niveau service, pas ici --
 * RolesGuard laisse passer les 3 roles, DiagnosisService rejette le
 * Mecanicien qui n'a pas cree le ticket.
 */
@Controller('work-orders/:workOrderId/diagnosis')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Get()
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.diagnosisService.findByWorkOrder(user.garageId as string, workOrderId);
  }

  @Put()
  upsert(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: UpsertDiagnosisDto,
  ) {
    return this.diagnosisService.upsert(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      dto,
    );
  }

  @Post('symptoms')
  addSymptom(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreateSymptomDto,
  ) {
    return this.diagnosisService.addSymptom(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      dto,
    );
  }

  @Patch('symptoms/:symptomId')
  updateSymptom(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('symptomId') symptomId: string,
    @Body() dto: UpdateSymptomDto,
  ) {
    return this.diagnosisService.updateSymptom(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      symptomId,
      dto,
    );
  }

  @Delete('symptoms/:symptomId')
  removeSymptom(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('symptomId') symptomId: string,
  ) {
    return this.diagnosisService.removeSymptom(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      symptomId,
    );
  }

  @Post('tests')
  addDiagnosticTest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreateDiagnosticTestDto,
  ) {
    return this.diagnosisService.addDiagnosticTest(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      dto,
    );
  }

  @Patch('tests/:testId')
  updateDiagnosticTest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('testId') testId: string,
    @Body() dto: UpdateDiagnosticTestDto,
  ) {
    return this.diagnosisService.updateDiagnosticTest(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      testId,
      dto,
    );
  }

  @Delete('tests/:testId')
  removeDiagnosticTest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Param('testId') testId: string,
  ) {
    return this.diagnosisService.removeDiagnosticTest(
      user.garageId as string,
      user.id,
      user.role,
      workOrderId,
      testId,
    );
  }
}
