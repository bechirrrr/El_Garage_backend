import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Enveloppe nodemailer. Deux idees volontaires :
 *
 * 1. Pas de SMTP configure -> pas de crash au demarrage. Si SMTP_HOST est
 *    absent de .env (cas normal en debut de dev, avant d'avoir cree un
 *    compte chez un fournisseur), on bascule sur un "envoi simule" qui
 *    logue l'email dans la console. Ca permet de developper et tester tout
 *    le flow d'invitation sans jamais avoir configure quoi que ce soit.
 *
 * 2. Un email qui echoue ne doit JAMAIS faire echouer l'action metier qui
 *    l'a declenche : sendMail() attrape ses propres erreurs et logue,
 *    plutot que de laisser l'appelant (ex: InvitationsService.create) se
 *    soucier d'un try/catch. Creer une invitation reste valide meme si
 *    l'email n'est pas parti -- le token fonctionne quand meme, l'Admin
 *    peut toujours copier/coller le lien manuellement.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    this.from = process.env.MAIL_FROM ?? 'no-reply@el-garage.local';

    if (!process.env.SMTP_HOST) {
      this.logger.warn(
        "SMTP_HOST absent de .env -- les emails seront affiches dans la console au lieu d'etre envoyes.",
      );
      this.transporter = null;
      return;
    }

    this.transporter = createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  async sendMail(options: { to: string; subject: string; html: string }): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[EMAIL SIMULE] A: ${options.to} | Sujet: ${options.subject}\n${options.html}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({ from: this.from, ...options });
    } catch (error) {
      this.logger.error(`Echec envoi email a ${options.to}`, error as Error);
    }
  }

  /** Section 4/29 : email envoye a chaque invitation (ou reactivation) d'un Mecanicien/Front Desk. */
  sendInvitationEmail(params: {
    to: string;
    name: string;
    garageName: string;
    token: string;
  }): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const acceptUrl = `${frontendUrl}/invitations/${params.token}`;

    return this.sendMail({
      to: params.to,
      subject: `Invitation a rejoindre ${params.garageName} sur El Garage`,
      html: `
        <p>Bonjour ${params.name},</p>
        <p>Vous avez ete invite a rejoindre <strong>${params.garageName}</strong> sur El Garage.</p>
        <p><a href="${acceptUrl}">Cliquez ici pour creer votre compte</a></p>
        <p>Ce lien expire dans 7 jours.</p>
      `,
    });
  }
}
