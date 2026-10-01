import { Module } from '@nestjs/common';
import { DiagnosisController } from './diagnosis.controller.js';
import { DiagnosisService } from './diagnosis.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [DiagnosisController],
  providers: [DiagnosisService],
})
export class DiagnosisModule {}
