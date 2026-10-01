import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
