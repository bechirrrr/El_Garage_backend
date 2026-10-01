import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

/**
 * Comme InvitationsController : garageId vient toujours de req.user
 * (@CurrentUser), jamais d'un parametre d'URL -- pas de GarageScopeGuard
 * ici, un utilisateur agit uniquement sur SON garage.
 *
 * Permissions (Section 29 / tableau Section 20) :
 *  - Create/Update : ADMIN, FRONT_DESK (pas MECHANIC)
 *  - Delete        : ADMIN uniquement
 *  - Read          : tous les roles garage-scoped (ADMIN, FRONT_DESK, MECHANIC)
 */
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.garageId as string, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.customersService.findAllForGarage(user.garageId as string);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK, Role.MECHANIC)
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.customersService.findOne(user.garageId as string, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.FRONT_DESK)
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user.garageId as string, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.customersService.remove(user.garageId as string, id);
  }
}
