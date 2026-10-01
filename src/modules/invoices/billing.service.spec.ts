import { BillingService } from './billing.service.js';

describe('BillingService.findPayments', () => {
  it('filtre sur le garage et la periode [from, to)', async () => {
    let where: any = null;
    const prisma = { payment: { findMany: (args: any) => ((where = args.where), Promise.resolve([])) } } as any;
    await new BillingService(prisma).findPayments('garage-1', '2026-09-28T00:00:00.000Z', '2026-10-05T00:00:00.000Z');
    expect(where.garageId).toBe('garage-1');
    expect(where.paidAt.gte).toEqual(new Date('2026-09-28T00:00:00.000Z'));
    expect(where.paidAt.lt).toEqual(new Date('2026-10-05T00:00:00.000Z'));
  });

  it('sans periode : aucun filtre de date', async () => {
    let where: any = null;
    const prisma = { payment: { findMany: (args: any) => ((where = args.where), Promise.resolve([])) } } as any;
    await new BillingService(prisma).findPayments('garage-1');
    expect(where.paidAt).toEqual({});
  });
});
