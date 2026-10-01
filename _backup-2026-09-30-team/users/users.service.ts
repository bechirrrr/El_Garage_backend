import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roster de l'equipe du garage (Section 5/18 -- "View all Mechanics") et
   * source du picker d'assignation d'un WorkOrder (Section 29). On exclut
   * volontairement passwordHash/googleId : jamais renvoyes, meme a un Admin.
   */
  findAllForGarage(garageId: string) {
    return this.prisma.user.findMany({
      where: { garageId },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }
}
