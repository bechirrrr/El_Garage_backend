import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
