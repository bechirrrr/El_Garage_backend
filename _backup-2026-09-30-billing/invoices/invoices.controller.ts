import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Imbrique sous /work-orders/:workOrderId/invoice, comme les autres
 * sous-ressources d'un ticket -- MAIS reserve a ADMIN/FRONT_DESK (Section
 * 20/29 : le Mecanicien n'a aucun droit sur le prix ou le paiement d'un
 * ticket, meme le sien). Pas de restriction "createur du ticket" ici,
 * contrairement a Tasks/Parts/Photos/Notes : le Front Desk a les memes
 * droits de facturation sur TOUS les tickets, pas seulement les siens
 * (Section 29 -- "manager du ticket" au meme niveau que l'Admin).
 */
@Controller('work-orders/:workOrderId/invoice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.invoicesService.findOne(user.garageId as string, workOrderId);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(user.garageId as string, user.id, workOrderId, dto);
  }

  @Patch()
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(user.garageId as string, user.id, workOrderId, dto);
  }

  @Post('issue')
  issue(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.invoicesService.issue(user.garageId as string, user.id, workOrderId);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.invoicesService.cancel(user.garageId as string, user.id, workOrderId);
  }

  @Get('payments')
  listPayments(@CurrentUser() user: CurrentUserPayload, @Param('workOrderId') workOrderId: string) {
    return this.invoicesService.listPayments(user.garageId as string, workOrderId);
  }

  @Post('payments')
  recordPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.invoicesService.recordPayment(user.garageId as string, user.id, workOrderId, dto);
  }
}
