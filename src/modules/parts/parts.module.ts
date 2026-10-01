import { Module } from '@nestjs/common';
import { GaragePartsController } from './garage-parts.controller.js';
import { PartsController } from './parts.controller.js';
import { PartsService } from './parts.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [PartsController, GaragePartsController],
  providers: [PartsService],
})
export class PartsModule {}
