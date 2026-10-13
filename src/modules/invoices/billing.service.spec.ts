import { ConflictException } from '@nestjs/common';
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

describe('BillingService.createDirect -- facture directe depuis Facturation', () => {
  function makePrisma(opts: { customerByPhone?: any; vehicleByPlate?: any } = {}) {
    const created: Record<string, any[]> = { customer: [], vehicle: [], workOrder: [], part: [], invoice: [] };
    const push = (k: string) => (args: any) => {
      const row = { id: `${k}-new`, ...args.data };
      created[k].push(row);
      return Promise.resolve(row);
    };
    const base: any = {
      garage: {
        findUnique: () =>
          Promise.resolve({ vatEnabled: false, vatRate: 0, stampDutyEnabled: false, stampDuty: 0, invoiceDueDays: 0 }),
        update: () => Promise.resolve({ workOrderCounter: 7 }),
      },
      customer: { findUnique: () => Promise.resolve(opts.customerByPhone ?? null), create: push('customer') },
      vehicle: { findUnique: () => Promise.resolve(opts.vehicleByPlate ?? null), create: push('vehicle') },
      workOrder: { create: push('workOrder') },
      part: { create: push('part') },
      invoice: { create: push('invoice') },
      activityEvent: { create: () => Promise.resolve({}) },
    };
    base.$transaction = (fn: any) => fn(base);
    return { prisma: base, created };
  }

  const dto = {
    customer: { name: 'Sami Ben Ali', phone: '24660912' },
    vehicle: { make: 'Peugeot', model: '208', plate: '203 TU 5561' },
    laborPrice: 40,
    parts: [{ name: 'Filtre à huile', quantity: 2, unitPrice: 15 }],
  };

  it('cree client, vehicule, OR termine et facture emise (non payee)', async () => {
    const { prisma, created } = makePrisma();
    const inv = await new BillingService(prisma).createDirect('garage-1', 'user-1', dto as any);
    expect(created.customer).toHaveLength(1);
    expect(created.vehicle).toHaveLength(1);
    expect(created.workOrder[0].status).toBe('COMPLETED');
    expect(created.part).toHaveLength(1);
    expect(inv.status).toBe('ISSUED');
    expect(inv.totalPrice.toFixed(3)).toBe('70.000'); // 40 + 2 x 15
    expect(inv.workOrder.number).toBe(7);
  });

  it('reutilise le client connu (meme telephone) et son vehicule (meme plaque)', async () => {
    const { prisma, created } = makePrisma({
      customerByPhone: { id: 'cust-1', name: 'Sami', garageId: 'garage-1' },
      vehicleByPlate: { id: 'veh-1', customerId: 'cust-1', make: 'Peugeot', model: '208', plate: '203 TU 5561' },
    });
    await new BillingService(prisma).createDirect('garage-1', 'user-1', dto as any);
    expect(created.customer).toHaveLength(0);
    expect(created.vehicle).toHaveLength(0);
    expect(created.workOrder[0].vehicleId).toBe('veh-1');
  });

  it("refuse une plaque deja enregistree pour un autre client", async () => {
    const { prisma } = makePrisma({
      customerByPhone: { id: 'cust-1', name: 'Sami', garageId: 'garage-1' },
      vehicleByPlate: { id: 'veh-1', customerId: 'cust-2', make: 'Peugeot', model: '208', plate: '203 TU 5561' },
    });
    await expect(new BillingService(prisma).createDirect('garage-1', 'user-1', dto as any)).rejects.toThrow(ConflictException);
  });
});
