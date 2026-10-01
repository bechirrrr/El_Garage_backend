import { Module } from '@nestjs/common';
import { GarageSettingsController } from './garage-settings.controller.js';
import { GarageSettingsService } from './garage-settings.service.js';
import { GaragesController } from './garages.controller.js';
import { GaragesService } from './garages.service.js';

// Pas besoin d'importer PrismaModule ici : il est @Global() (voir
// src/prisma/prisma.module.ts), donc PrismaService est deja injectable.
@Module({
  controllers: [GaragesController, GarageSettingsController],
  providers: [GaragesService, GarageSettingsService],
})
export class GaragesModule {}
