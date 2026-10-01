import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { BillingService } from './billing.service.js';
import { PeriodQueryDto } from './dto/period-query.dto.js';

/**
 * Ecran Facturation & caisse : GET /invoices (toutes les factures) et
 * GET /payments?from&to (encaissements d'une periode). Memes droits que la
 * facturation d'un OR : ADMIN et FRONT_DESK, jamais le MECHANIC.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  findInvoices(@CurrentUser() user: CurrentUserPayload) {
    return this.billingService.findAllInvoices(user.garageId as string);
  }

  @Get('payments')
  findPayments(@CurrentUser() user: CurrentUserPayload, @Query() query: PeriodQueryDto) {
    return this.billingService.findPayments(user.garageId as string, query.from, query.to);
  }
}
