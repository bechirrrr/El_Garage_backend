import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { PeriodQueryDto } from '../invoices/dto/period-query.dto.js';
import { AdjustStockDto, CreateStockItemDto, ReceiveStockDto, UpdateStockItemDto } from './dto/stock-item.dto.js';
import { StockService } from './stock.service.js';

/**
 * Stock de pieces : lecture pour tous les membres (choisir une piece dans un
 * OR) ; creation, modification, entrees et inventaire pour ADMIN / FRONT_DESK.
 */
@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.stock.findAll(user.garageId as string);
  }

  @Get('movements')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  recent(@CurrentUser() user: CurrentUserPayload, @Query() q: PeriodQueryDto) {
    return this.stock.recentMovements(user.garageId as string, q.from);
  }

  @Get(':id/movements')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  movements(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.stock.movements(user.garageId as string, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateStockItemDto) {
    return this.stock.create(user.garageId as string, user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateStockItemDto) {
    return this.stock.update(user.garageId as string, id, dto);
  }

  @Post(':id/receive')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  receive(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: ReceiveStockDto) {
    return this.stock.receive(user.garageId as string, user.id, id, dto);
  }

  @Post(':id/adjust')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  adjust(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.stock.adjust(user.garageId as string, user.id, id, dto);
  }
}
