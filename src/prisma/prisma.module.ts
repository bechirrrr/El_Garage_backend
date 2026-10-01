import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * @Global() est LA decision qui compte pour la suite du projet.
 *
 * Sans elle, chaque futur module (customers, vehicles, work-orders, parts,
 * invoices...) devrait ecrire `imports: [PrismaModule]`. Avec elle, on declare
 * PrismaService une seule fois et il est injectable partout.
 *
 * A n'utiliser QUE pour l'infrastructure transverse (base de donnees, config,
 * logger) - surtout pas pour les modules metier, qui doivent rester explicites.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
