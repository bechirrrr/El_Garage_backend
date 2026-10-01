import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';

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
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { garage: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email ou mot de passe incorrect.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Email ou mot de passe incorrect.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte est desactive.');
    }

    const payload = { sub: user.id, garageId: user.garageId, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    const { passwordHash: _omit, garage, ...userWithoutPassword } = user;
    return {
      accessToken,
      user: userWithoutPassword,
      garageStatus: garage?.status ?? null,
      // Nom du garage pour l'affichage (barre laterale) -- null pour un OWNER.
      garageName: garage?.name ?? null,
    };
  }
}
