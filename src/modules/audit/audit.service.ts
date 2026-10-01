import { Injectable } from '@nestjs/common';
import { ActivityCategory, Prisma, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AUDIT_KINDS, AUDIT_KIND_NAMES, isAfterPaymentAlert, kindOf, type AuditKind } from './audit-kinds.js';
import type { AuditQueryDto } from './dto/audit-query.dto.js';

const DEFAULT_LIMIT = 50;

const WORK_ORDER_SELECT = {
  id: true,
  number: true,
  vehicle: { select: { make: true, model: true, plate: true } },
  customer: { select: { name: true } },
} as const;

/**
 * Journal d'audit (Section 30bis) : les ActivityEvent de categorie
 * SENSITIVE du garage -- prix, paiements, statuts, assignations, factures.
 * Lecture seule : aucune route ne modifie ni ne supprime une ligne.
 *
 * Visibilite (Section 29, "View Audit Log") : l'ADMIN voit tout le garage,
 * le FRONT_DESK seulement ses propres actions (meme regle que la fiche OR,
 * voir WorkOrdersService.filterAuditVisibility). Le MECHANIC n'a pas acces
 * (RolesGuard du controller).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async find(garageId: string, user: { id: string; role: Role }, query: AuditQueryDto) {
    const actorId = user.role === Role.FRONT_DESK ? user.id : query.actorId;
    const limit = query.limit ?? DEFAULT_LIMIT;

    // Base commune : garage + SENSITIVE + periode + membre + recherche.
    const base: Prisma.ActivityEventWhereInput = {
      garageId,
      category: ActivityCategory.SENSITIVE,
      ...(actorId ? { actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...this.searchFilter(query.q),
    };

    // Lignes affichees : + famille, + alertes seulement, + pagination.
    const where: Prisma.ActivityEventWhereInput = {
      AND: [
        base,
        query.kind ? { type: { in: [...AUDIT_KINDS[query.kind]] } } : {},
        query.alertsOnly ? { type: 'INVOICE_PRICE_UPDATED', metadata: { path: ['afterPayment'], equals: true } } : {},
        query.before ? { createdAt: { lt: new Date(query.before) } } : {},
      ],
    };

    const [rows, summary] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: {
          actor: { select: { id: true, name: true, role: true } },
          workOrder: { select: WORK_ORDER_SELECT },
        },
      }),
      // Resume de la periode (compteurs, alertes) : quelques centaines de lignes par mois au plus.
      this.prisma.activityEvent.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          metadata: true,
          createdAt: true,
          workOrderId: true,
          actor: { select: { id: true, name: true, role: true } },
          workOrder: { select: WORK_ORDER_SELECT },
        },
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Assignations : metadata porte des ids de mecaniciens -> on renvoie leurs noms.
    const userIds = new Set<string>();
    for (const e of page) {
      if (e.type !== 'MECHANIC_ASSIGNED') continue;
      const m = (e.metadata ?? {}) as { old?: string | null; new?: string | null };
      if (m.old) userIds.add(m.old);
      if (m.new) userIds.add(m.new);
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({ where: { id: { in: [...userIds] }, garageId }, select: { id: true, name: true } })
      : [];

    return {
      items: page.map((e) => ({
        id: e.id,
        type: e.type,
        kind: kindOf(e.type),
        message: e.message,
        metadata: e.metadata,
        createdAt: e.createdAt,
        alert: isAfterPaymentAlert(e.type, e.metadata),
        actor: e.actor,
        workOrder: e.workOrder,
      })),
      userNames: Object.fromEntries(users.map((u) => [u.id, u.name])),
      nextBefore: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
      ...this.summarize(summary),
    };
  }

  /** Compteurs par famille, chiffres du resume et alertes "prix modifie apres paiement". */
  summarize(
    events: {
      id: string;
      type: string;
      metadata: unknown;
      createdAt: Date;
      workOrderId: string | null;
      actor: { id: string; name: string; role: Role } | null;
      workOrder: unknown;
    }[],
  ) {
    const counts = Object.fromEntries(AUDIT_KIND_NAMES.map((k) => [k, 0])) as Record<AuditKind, number>;
    let paymentsTotal = 0;
    const statusWorkOrders = new Set<string>();
    let reassignmentsByFrontDesk = 0;
    const alerts: typeof events = [];

    for (const e of events) {
      const kind = kindOf(e.type);
      if (kind !== 'other') counts[kind]++;
      if (kind === 'payment') paymentsTotal += Number((e.metadata as { amount?: string } | null)?.amount ?? 0);
      if (kind === 'status' && e.workOrderId) statusWorkOrders.add(e.workOrderId);
      if (kind === 'assignment' && e.actor?.role === Role.FRONT_DESK) reassignmentsByFrontDesk++;
      if (isAfterPaymentAlert(e.type, e.metadata)) alerts.push(e);
    }

    return {
      counts: { all: events.length, ...counts },
      stats: {
        priceAfterPayment: alerts.length,
        paymentsTotal: paymentsTotal.toFixed(3),
        statusWorkOrders: statusWorkOrders.size,
        reassignmentsByFrontDesk,
      },
      alerts: alerts.map((e) => ({
        id: e.id,
        metadata: e.metadata,
        createdAt: e.createdAt,
        actor: e.actor,
        workOrder: e.workOrder,
      })),
    };
  }

  /** Recherche : n° d'OR ("1431", "OR-1431"), plaque ou nom du client de l'OR. */
  private searchFilter(q?: string): Prisma.ActivityEventWhereInput {
    const text = q?.trim();
    if (!text) return {};
    const num = /^(?:or-?)?\s*(\d+)$/i.exec(text);
    const or: Prisma.WorkOrderWhereInput[] = [
      { vehicle: { plate: { contains: text, mode: 'insensitive' } } },
      { customer: { name: { contains: text, mode: 'insensitive' } } },
    ];
    if (num) or.unshift({ number: Number(num[1]) });
    return { workOrder: { OR: or } };
  }
}
