import 'dotenv/config'; // charge .env AVANT tout le reste
import { ValidationPipe } from '@nestjs/common';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Compression gzip des reponses (au-dela de 1 Ko). Les listes JSON sont tres
  // repetitives : GET /work-orders passe de ~1,8 Mo a ~90 Ko pour 3 000 OR,
  // soit ~20x moins a telecharger pour le navigateur (mesure sur Postgres).
  // Le navigateur decompresse tout seul (en-tete Accept-Encoding) : rien a
  // changer cote Angular.
  app.use(compression());

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

  // Autorise le futur frontend Angular (port 4200 par defaut) a appeler l'API.
  app.enableCors({
    origin: ['http://localhost:4200'],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API demarree sur http://localhost:${port}/api`);
}
void bootstrap();
