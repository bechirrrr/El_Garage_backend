import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [InvoicesController, BillingController],
  providers: [InvoicesService, BillingService],
})
export class InvoicesModule {}
