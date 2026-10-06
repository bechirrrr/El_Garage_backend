import 'dotenv/config'; // charge .env AVANT tout le reste
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';

/**
 * Refuse de demarrer avec un secret JWT absent, trop court, ou (en production)
 * reste a la valeur d'exemple : avec un secret devinable, n'importe qui peut
 * fabriquer un token ADMIN/OWNER valide.
 */
function assertJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET est absent ou trop court (32 caracteres minimum) -- voir .env.example.');
  }
  if (process.env.NODE_ENV === 'production' && secret.startsWith('change-me')) {
    throw new Error("JWT_SECRET est encore la valeur d'exemple : genere un vrai secret aleatoire.");
  }
}

async function bootstrap() {
  assertJwtSecret();
  const app = await NestFactory.create(AppModule);

  // En-tetes de securite de base (l'equivalent minimal du paquet `helmet`) :
  // pas de devinette de type MIME, pas d'affichage dans une iframe, pas de
  // fuite d'URL via Referer, et on ne revele pas la techno du serveur.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.removeHeader('X-Powered-By');
    next();
  });

  // Toutes les routes seront prefixees : /api/auth/login, /api/vehicles, ...
  app.setGlobalPrefix('api');

  // Validation automatique de TOUTES les donnees entrantes, via les DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // supprime les champs non declares dans le DTO
      forbidNonWhitelisted: true, // ...et rejette la requete s'il y en a
      transform: true, // convertit les types (ex: "42" -> 42)
    }),
  );

  // Autorise le frontend Angular a appeler l'API. FRONTEND_URL peut contenir
  // plusieurs origines separees par des virgules (ex: dev + production).
  const corsOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    // Pas de `credentials: true` : l'authentification passe par l'en-tete
    // Authorization (Bearer), jamais par un cookie -- inutile donc d'autoriser
    // le navigateur a joindre des cookies, ce qui ouvrirait la porte au CSRF.
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API demarree sur http://localhost:${port}/api`);
}
void bootstrap();
