import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module.js';
import { MailModule } from './mail/mail.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { GaragesModule } from './modules/garages/garages.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { InvitationsModule } from './modules/invitations/invitations.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { VehiclesModule } from './modules/vehicles/vehicles.module.js';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module.js';
import { DiagnosisModule } from './modules/diagnosis/diagnosis.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { PartsModule } from './modules/parts/parts.module.js';
import { PhotosModule } from './modules/photos/photos.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { StockModule } from './modules/stock/stock.module.js';

/**
 * Module racine.
 *
 * Convention pour la suite : les modules d'INFRASTRUCTURE (Config, Prisma)
 * restent ici. Chaque module METIER vivra dans src/modules/<domaine>/ et sera
 * ajoute a la liste `imports` ci-dessous :
 *
 *   AuthModule, GaragesModule, UsersModule, CustomersModule,
 *   VehiclesModule, WorkOrdersModule, PartsModule, ...
 */
@Module({
  imports: [
    // isGlobal: true -> plus besoin d'importer ConfigModule dans chaque module
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    GaragesModule,
    InvitationsModule,
    CustomersModule,
    VehiclesModule,
    WorkOrdersModule,
    DiagnosisModule,
    TasksModule,
    PartsModule,
    PhotosModule,
    NotesModule,
    InvoicesModule,
    ReservationsModule,
    UsersModule,
    AuditModule,
    StockModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
