import { Module } from '@nestjs/common';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

// PrismaModule est @Global(), pas besoin de l'importer ici.
@Module({
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
