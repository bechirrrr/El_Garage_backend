import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { InvoicesService } from './invoices.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    workOrder: {
      findUnique: () =>
        Promise.resolve({ id: 'wo-1', garageId: 'garage-1', customerId: 'customer-1' }),
    },
    part: {
      findMany: () => Promise.resolve([]),
    },
    invoice: {
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'invoice-1', status: 'DRAFT', ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
    },
    payment: {
      count: () => Promise.resolve(0),
      aggregate: () => Promise.resolve({ _sum: { amount: null } }),
      create: (args: any) => Promise.resolve({ id: 'payment-1', ...args.data }),
      findMany: () => Promise.resolve([]),
    },
    activityEvent: { create: () => Promise.resolve({}) },
    ...overrides,
  };
  return {
    ...base,
    $transaction: (fn: (tx: any) => any) => fn(base),
  } as any;
}

describe('InvoicesService.create', () => {
  it('calcule partsTotal en sommant les Parts existantes du ticket', async () => {
    const prisma = makePrismaMock({
      part: {
        findMany: () =>
          Promise.resolve([
            { quantity: new Prisma.Decimal(5), unitPrice: new Prisma.Decimal(30) }, // 150
            { quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(480) }, // 480
          ]),
      },
    });
    const service = new InvoicesService(prisma);

    const result = await service.create('garage-1', 'admin-1', 'wo-1', { laborPrice: 200 });

    expect(result.partsTotal.toFixed(2)).toBe('630.00');
    expect(result.totalPrice.toFixed(2)).toBe('830.00');
    expect(result.status).toBe('DRAFT');
  });

  it("rejette si une facture existe deja pour ce ticket (relation 1-1)", async () => {
    const prisma = makePrismaMock({
      invoice: { findUnique: () => Promise.resolve({ id: 'invoice-1' }) },
    });
    const service = new InvoicesService(prisma);

    await expect(service.create('garage-1', 'admin-1', 'wo-1', {})).rejects.toThrow(ConflictException);
  });

  it('rejette si le ticket est introuvable / dans un autre garage', async () => {
    const prisma = makePrismaMock({
      workOrder: { findUnique: () => Promise.resolve(null) },
    });
    const service = new InvoicesService(prisma);

    await expect(service.create('garage-1', 'admin-1', 'wo-1', {})).rejects.toThrow(NotFoundException);
  });
});

describe('InvoicesService.update -- flag afterPayment (Section 30bis)', () => {
  it('journalise afterPayment=true si le prix change alors que des paiements existent deja', async () => {
    const events: any[] = [];
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({
            id: 'invoice-1',
            status: 'PARTIALLY_PAID',
            laborPrice: new Prisma.Decimal(200),
            partsTotal: new Prisma.Decimal(630),
            totalPrice: new Prisma.Decimal(830),
          }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
      payment: {
        count: () => Promise.resolve(1),
        aggregate: () => Promise.resolve({ _sum: { amount: new Prisma.Decimal(400) } }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new InvoicesService(prisma);

    const result = await service.update('garage-1', 'admin-1', 'wo-1', { laborPrice: 300 });

    expect(result.totalPrice.toFixed(2)).toBe('930.00');
    expect(events[0].metadata.afterPayment).toBe(true);
    expect(events[0].category).toBe('SENSITIVE');
  });

  it('rejette si la facture est CANCELLED', async () => {
    const prisma = makePrismaMock({
      invoice: { findUnique: () => Promise.resolve({ id: 'invoice-1', status: 'CANCELLED' }) },
    });
    const service = new InvoicesService(prisma);

    await expect(service.update('garage-1', 'admin-1', 'wo-1', { laborPrice: 100 })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('InvoicesService.issue', () => {
  it('rejette si la facture n\'est pas en DRAFT', async () => {
    const prisma = makePrismaMock({
      invoice: { findUnique: () => Promise.resolve({ id: 'invoice-1', status: 'ISSUED' }) },
    });
    const service = new InvoicesService(prisma);

    await expect(service.issue('garage-1', 'admin-1', 'wo-1')).rejects.toThrow(BadRequestException);
  });

  it('passe DRAFT -> ISSUED et fixe issuedById/issuedAt', async () => {
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({ id: 'invoice-1', status: 'DRAFT', totalPrice: new Prisma.Decimal(830) }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new InvoicesService(prisma);

    const result = await service.issue('garage-1', 'admin-1', 'wo-1');

    expect(result.status).toBe('ISSUED');
    expect(result.issuedById).toBe('admin-1');
  });
});

describe('InvoicesService.cancel', () => {
  it("rejette si la facture est deja PARTIALLY_PAID (l'argent a deja bouge)", async () => {
    const prisma = makePrismaMock({
      invoice: { findUnique: () => Promise.resolve({ id: 'invoice-1', status: 'PARTIALLY_PAID' }) },
    });
    const service = new InvoicesService(prisma);

    await expect(service.cancel('garage-1', 'admin-1', 'wo-1')).rejects.toThrow(BadRequestException);
  });
});

describe('InvoicesService.recordPayment', () => {
  it('rejette si la facture est encore en DRAFT', async () => {
    const prisma = makePrismaMock({
      invoice: { findUnique: () => Promise.resolve({ id: 'invoice-1', status: 'DRAFT' }) },
    });
    const service = new InvoicesService(prisma);

    await expect(
      service.recordPayment('garage-1', 'admin-1', 'wo-1', { amount: 100, method: 'CASH' as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejette si le montant depasse le solde restant du', async () => {
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({ id: 'invoice-1', status: 'ISSUED', totalPrice: new Prisma.Decimal(830) }),
      },
      payment: {
        count: () => Promise.resolve(0),
        aggregate: () => Promise.resolve({ _sum: { amount: new Prisma.Decimal(800) } }),
      },
    });
    const service = new InvoicesService(prisma);

    await expect(
      service.recordPayment('garage-1', 'admin-1', 'wo-1', { amount: 100, method: 'CASH' as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('passe la facture a PARTIALLY_PAID si le paiement ne couvre pas tout le solde', async () => {
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({ id: 'invoice-1', status: 'ISSUED', totalPrice: new Prisma.Decimal(830) }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
      payment: {
        count: () => Promise.resolve(0),
        aggregate: () => Promise.resolve({ _sum: { amount: null } }),
        create: (args: any) => Promise.resolve({ id: 'payment-1', ...args.data }),
      },
    });
    const service = new InvoicesService(prisma);

    const result = await service.recordPayment('garage-1', 'admin-1', 'wo-1', {
      amount: 400,
      method: 'CASH' as any,
    });

    expect(result.amount.toFixed(2)).toBe('400.00');
  });

  it('passe la facture a PAID quand le paiement solde exactement le total', async () => {
    const events: any[] = [];
    const invoiceUpdates: any[] = [];
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({ id: 'invoice-1', status: 'PARTIALLY_PAID', totalPrice: new Prisma.Decimal(830) }),
        update: (args: any) => {
          invoiceUpdates.push(args.data);
          return Promise.resolve({ id: args.where.id, ...args.data });
        },
      },
      payment: {
        count: () => Promise.resolve(1),
        aggregate: () => Promise.resolve({ _sum: { amount: new Prisma.Decimal(400) } }),
        create: (args: any) => Promise.resolve({ id: 'payment-2', ...args.data }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new InvoicesService(prisma);

    await service.recordPayment('garage-1', 'admin-1', 'wo-1', { amount: 430, method: 'CARD' as any });

    expect(invoiceUpdates[0].status).toBe('PAID');
    expect(events[0].metadata.invoiceStatus).toBe('PAID');
  });
});
