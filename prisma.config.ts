// ---------------------------------------------------------------------------
// Configuration du CLI Prisma (Prisma 7+)
//
// Separation des roles :
//   - prisma/schema/*.prisma -> QUOI : la forme des donnees, un fichier par domaine
//   - prisma.config.ts       -> OU   : comment les outils joignent la base
//
// `schema` pointe vers un DOSSIER : Prisma y cherche recursivement tous les
// fichiers .prisma. Pour ajouter un modele, il suffit de creer un nouveau
// fichier dans prisma/schema/ - aucune config a toucher.
//
// Contrainte Prisma : le dossier `migrations` doit etre a cote du fichier
// .prisma qui contient le bloc `datasource` (ici main.prisma).
// ---------------------------------------------------------------------------

import 'dotenv/config'; // charge .env dans process.env
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',

  migrations: {
    path: 'prisma/schema/migrations',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});
