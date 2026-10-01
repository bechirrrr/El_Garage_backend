import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
