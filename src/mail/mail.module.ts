import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';

// @Global() comme PrismaModule : MailService est de l'infrastructure
// transverse (voir le commentaire de prisma.module.ts) -- de futurs modules
// (Reservation pour des rappels, Invoice pour des relances...) en auront
// besoin eux aussi, pas seulement Invitations.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
