import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

/**
 * @Global() : suit exactement la meme convention que PrismaModule et
 * MailModule. JwtAuthGuard (utilise via @UseGuards dans Garages, Invitations,
 * Customers, Vehicles, WorkOrders, Diagnosis, Tasks) depend en interne de
 * PassportModule -- sans @Global() + export ici, chacun de ces modules aurait
 * du re-importer PassportModule lui-meme pour que Nest puisse resoudre les
 * dependances du guard (erreur "Nest can't resolve dependencies of the
 * JwtAuthGuard" sinon, qui ne se voit qu'au vrai demarrage de l'appli, pas
 * dans les tests unitaires qui mockent tout).
 */
// PassportModule.register(...) -- et non un import "nu" de PassportModule --
// est ce qui cree reellement le provider AuthModuleOptions dont AuthGuard()
// (donc JwtAuthGuard) a besoin. Sans le .register(), ce provider n'existe
// nulle part dans l'appli, meme pas dans AuthModule lui-meme : @Global() +
// exports ne peut pas re-exporter un provider qui n'a jamais ete cree.
const passportModule = PassportModule.register({ defaultStrategy: 'jwt' });

@Global()
@Module({
  imports: [
    passportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      // `expiresIn` attend un type "StringValue" (gabarit '7d', '1h'...), pas
      // un `string` generique -- mais une variable d'env est toujours un
      // `string` non type. Cast assume : la valeur vient de .env, controlee
      // par nous, pas d'une entree utilisateur.
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [passportModule],
})
export class AuthModule {}
