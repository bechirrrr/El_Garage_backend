import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { CurrentUserPayload } from '../../common/types/current-user.type.js';
import { Role } from '../../generated/prisma/client.js';
import { AuditService } from './audit.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

/**
 * Journal d'audit (Section 30bis) : GET /audit, lecture seule.
 * ADMIN : tout le garage. FRONT_DESK : ses propres actions (le service
 * force actorId). MECHANIC : refuse.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FRONT_DESK)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  find(@CurrentUser() user: CurrentUserPayload, @Query() query: AuditQueryDto) {
    return this.auditService.find(user.garageId as string, user, query);
  }
}
