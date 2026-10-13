import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { passwordFingerprint } from '../../common/password-fingerprint.js';
import { normalizePhone } from '../../common/phone.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';

const BCRYPT_ROUNDS = 10;

/**
 * Hash factice compare quand l'identifiant n'existe pas : sans lui, la
 * reponse "compte inconnu" serait nettement plus rapide que "mauvais mot de
 * passe" (pas de calcul bcrypt), ce qui permettrait de deviner quels
 * emails/telephones ont un compte en mesurant le temps de reponse.
 */
const DUMMY_HASH = bcrypt.hashSync('compte-inexistant', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Volontairement PAS de "utilisateur introuvable" vs "mauvais mot de
   * passe" distincts : le meme message d'erreur pour les deux evite de
   * confirmer a un attaquant qu'un email donne existe dans la base.
   *
   * On inclut le Garage pour renvoyer son status : c'est ce qui permet au
   * frontend d'afficher l'ecran "Awaiting Approval" (Section 4) sans appel
   * API supplementaire -- le login d'un Admin dont le Garage est encore
   * PENDING_APPROVAL reussit quand meme, seul l'affichage cote frontend
   * change.
   */
  async login(dto: LoginDto) {
    // Un @ -> c'est un email ; sinon un numero de telephone (compte cree par l'Admin sans email).
    const identifier = dto.identifier.trim();
    const where = identifier.includes('@') ? { email: identifier } : { phone: normalizePhone(identifier) };
    const user = await this.prisma.user.findUnique({
      where,
      include: { garage: true },
    });

    if (!user || !user.passwordHash) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte est desactive.');
    }

    const accessToken = this.signToken({ ...user, passwordHash: user.passwordHash });

    const { passwordHash: _omit, garage, ...userWithoutPassword } = user;
    return {
      accessToken,
      user: userWithoutPassword,
      garageStatus: garage?.status ?? null,
      // Nom du garage pour l'affichage (barre laterale) -- null pour un OWNER.
      garageName: garage?.name ?? null,
    };
  }

  private signToken(user: { id: string; garageId: string | null; role: string; passwordHash: string }) {
    return this.jwtService.sign({
      sub: user.id,
      garageId: user.garageId,
      role: user.role,
      pv: passwordFingerprint(user.passwordHash),
    });
  }

  /**
   * L'utilisateur connecte change son propre mot de passe. Obligatoire a la
   * premiere connexion d'un compte cree par l'Admin (mustChangePassword) :
   * on remet alors le drapeau a false.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Compte introuvable.');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException("Le nouveau mot de passe doit etre different de l'actuel.");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    // Le changement invalide tous les anciens tokens (empreinte `pv`) : on en
    // renvoie un nouveau pour que la session en cours, elle, continue.
    return { success: true, accessToken: this.signToken({ ...user, passwordHash }) };
  }
}
