import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
// ESM ("type": "module" + moduleResolution nodenext) : l'extension .js est
// OBLIGATOIRE sur tous les imports relatifs, meme pour un fichier .ts.
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * PrismaService = le PrismaClient transforme en service NestJS injectable.
 *
 * `extends PrismaClient` permet d'ecrire directement
 * `this.prisma.user.findMany()` dans les autres services.
 *
 * Prisma 7 : la connexion n'est plus ouverte par un moteur Rust interne mais
 * par un "driver adapter" - ici PrismaPg, qui s'appuie sur le driver `pg`.
 * C'est `pg` qui gere le pool de connexions.
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });
    super({ adapter });
  }
}
