import { Module } from '@nestjs/common';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
