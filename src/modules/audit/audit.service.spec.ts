import { AuditService } from './audit.service.js';
import { isAfterPaymentAlert, kindOf } from './audit-kinds.js';

function prismaMock(rows: any[] = [], summary: any[] = [], users: any[] = []) {
  const calls: any[] = [];
  let n = 0;
  return {
    calls,
    prisma: {
      activityEvent: {
        findMany: (args: any) => {
          calls.push(args);
          return Promise.resolve(n++ === 0 ? rows : summary);
        },
      },
      user: { findMany: () => Promise.resolve(users) },
    } as any,
  };
}

const admin = { id: 'admin-1', role: 'ADMIN' as any };
const desk = { id: 'desk-1', role: 'FRONT_DESK' as any };

describe('audit-kinds', () => {
  it('classe les types SENSITIVE par famille', () => {
    expect(kindOf('INVOICE_PRICE_UPDATED')).toBe('price');
    expect(kindOf('PAYMENT_RECORDED')).toBe('payment');
    expect(kindOf('STATUS_CHANGED')).toBe('status');
    expect(kindOf('MECHANIC_ASSIGNED')).toBe('assignment');
    expect(kindOf('INVOICE_ISSUED')).toBe('invoice');
    expect(kindOf('SOMETHING_NEW')).toBe('other');
  });

  it("detecte l'alerte prix modifie apres paiement", () => {
    expect(isAfterPaymentAlert('INVOICE_PRICE_UPDATED', { afterPayment: true })).toBe(true);
    expect(isAfterPaymentAlert('INVOICE_PRICE_UPDATED', { afterPayment: false })).toBe(false);
    expect(isAfterPaymentAlert('PAYMENT_RECORDED', { afterPayment: true })).toBe(false);
  });
});

describe('AuditService.find', () => {
  it('ne lit que les evenements SENSITIVE du garage', async () => {
    const { prisma, calls } = prismaMock();
    await new AuditService(prisma).find('garage-1', admin, {});
    const base = calls[1].where;
    expect(base.garageId).toBe('garage-1');
    expect(base.category).toBe('SENSITIVE');
    expect(base.actorId).toBeUndefined();
  });

  it("force l'Accueil sur ses propres actions, meme s'il demande un autre membre", async () => {
    const { prisma, calls } = prismaMock();
    await new AuditService(prisma).find('garage-1', desk, { actorId: 'someone-else' });
    expect(calls[1].where.actorId).toBe('desk-1');
  });

  it("l'Admin peut filtrer sur un membre et une famille", async () => {
    const { prisma, calls } = prismaMock();
    await new AuditService(prisma).find('garage-1', admin, { actorId: 'desk-1', kind: 'invoice' });
    expect(calls[1].where.actorId).toBe('desk-1');
    expect(calls[0].where.AND[1]).toEqual({ type: { in: ['INVOICE_CREATED', 'INVOICE_ISSUED', 'INVOICE_CANCELLED'] } });
  });

  it("recherche par n° d'OR (OR-1431) ou texte", async () => {
    const { prisma, calls } = prismaMock();
    await new AuditService(prisma).find('garage-1', admin, { q: 'OR-1431' });
    expect(calls[1].where.workOrder.OR[0]).toEqual({ number: 1431 });
  });

  it('pagine avec nextBefore et resout les noms des mecaniciens assignes', async () => {
    const rows = [
      { id: 'e1', type: 'MECHANIC_ASSIGNED', metadata: { old: 'm1', new: 'm2' }, createdAt: new Date('2026-09-30T10:00:00Z'), actor: null, workOrder: null },
      { id: 'e2', type: 'STATUS_CHANGED', metadata: {}, createdAt: new Date('2026-09-30T09:00:00Z'), actor: null, workOrder: null },
    ];
    const { prisma } = prismaMock(rows, [], [{ id: 'm1', name: 'Mohamed' }, { id: 'm2', name: 'Karim' }]);
    const res = await new AuditService(prisma).find('garage-1', admin, { limit: 1 });
    expect(res.items).toHaveLength(1);
    expect(res.nextBefore).toBe('2026-09-30T10:00:00.000Z');
    expect(res.userNames).toEqual({ m1: 'Mohamed', m2: 'Karim' });
  });

  it('resume : compteurs, total encaisse, alertes', async () => {
    const summary = [
      { id: 'a', type: 'INVOICE_PRICE_UPDATED', metadata: { afterPayment: true }, createdAt: new Date(), workOrderId: 'w1', actor: null, workOrder: null },
      { id: 'b', type: 'PAYMENT_RECORDED', metadata: { amount: '300.500' }, createdAt: new Date(), workOrderId: 'w1', actor: null, workOrder: null },
      { id: 'c', type: 'PAYMENT_RECORDED', metadata: { amount: '100.000' }, createdAt: new Date(), workOrderId: 'w2', actor: null, workOrder: null },
      { id: 'd', type: 'MECHANIC_ASSIGNED', metadata: {}, createdAt: new Date(), workOrderId: 'w2', actor: { id: 'x', name: 'M', role: 'FRONT_DESK' }, workOrder: null },
    ];
    const { prisma } = prismaMock([], summary);
    const res = await new AuditService(prisma).find('garage-1', admin, {});
    expect(res.counts).toEqual({ all: 4, price: 1, payment: 2, status: 0, assignment: 1, invoice: 0, settings: 0 });
    expect(res.stats.paymentsTotal).toBe('400.500');
    expect(res.stats.reassignmentsByFrontDesk).toBe(1);
    expect(res.alerts.map((a) => a.id)).toEqual(['a']);
  });
});
