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
    garage: {
      // Sans TVA ni timbre : les tests historiques gardent total = main-d'oeuvre + pieces.
      findUnique: () =>
        Promise.resolve({ vatEnabled: false, vatRate: new Prisma.Decimal(19), stampDutyEnabled: false, stampDuty: new Prisma.Decimal(1), invoiceDueDays: 30 }),
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

  it('recree une facture ANNULEE : meme ligne remise en DRAFT avec les montants du jour', async () => {
    const prisma = makePrismaMock({
      part: { findMany: () => Promise.resolve([{ quantity: new Prisma.Decimal(2), unitPrice: new Prisma.Decimal(50) }]) },
      invoice: {
        findUnique: () => Promise.resolve({ id: 'invoice-1', status: 'CANCELLED', issuedAt: new Date() }),
        create: () => Promise.reject(new Error('ne doit pas creer une 2e ligne')),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });

    const result = await new InvoicesService(prisma).create('garage-1', 'admin-1', 'wo-1', { laborPrice: 80 });

    expect(result.id).toBe('invoice-1');
    expect(result.status).toBe('DRAFT');
    expect(result.issuedAt).toBeNull();
    expect(result.totalPrice.toFixed(2)).toBe('180.00');
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
      part: {
        findMany: () => Promise.resolve([{ quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(630) }]),
      },
      invoice: {
        findUnique: () =>
          Promise.resolve({
            id: 'invoice-1',
            status: 'PARTIALLY_PAID',
            laborPrice: new Prisma.Decimal(200),
            partsTotal: new Prisma.Decimal(630),
            totalPrice: new Prisma.Decimal(830),
            vatRate: new Prisma.Decimal(0),
            stampDuty: new Prisma.Decimal(0),
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

  it('facture PAID dont le prix augmente : redevient PARTIALLY_PAID (la difference reste a payer)', async () => {
    const paidInvoice = {
      id: 'invoice-1',
      workOrderId: 'wo-1',
      status: 'PAID',
      laborPrice: new Prisma.Decimal(400),
      partsTotal: new Prisma.Decimal(0),
      vatRate: new Prisma.Decimal(0),
      stampDuty: new Prisma.Decimal(0),
      totalPrice: new Prisma.Decimal(400),
    };
    const payment = {
      count: () => Promise.resolve(1),
      aggregate: () => Promise.resolve({ _sum: { amount: new Prisma.Decimal(400) } }),
    };
    const invoice = {
      findUnique: () => Promise.resolve(paidInvoice),
      update: (args: any) => Promise.resolve({ ...paidInvoice, ...args.data }),
    };
    const service = new InvoicesService(makePrismaMock({ invoice, payment }));

    const raised = await service.update('garage-1', 'user-1', 'wo-1', { laborPrice: 500 });
    expect(raised.status).toBe('PARTIALLY_PAID');

    // Prix baisse sous le deja-paye : reste PAID.
    const lowered = await service.update('garage-1', 'user-1', 'wo-1', { laborPrice: 300 });
    expect(lowered.status).toBe('PAID');
  });

  it('piece ajoutee apres paiement : Pieces HT est recalcule depuis les Parts et le reste a payer reapparait', async () => {
    const paidInvoice = {
      id: 'invoice-1',
      workOrderId: 'wo-1',
      status: 'PAID',
      laborPrice: new Prisma.Decimal(200),
      partsTotal: new Prisma.Decimal(100),
      vatRate: new Prisma.Decimal(0),
      stampDuty: new Prisma.Decimal(0),
      totalPrice: new Prisma.Decimal(300),
    };
    const service = new InvoicesService(
      makePrismaMock({
        // La piece a 100 deja facturee + une piece a 45 ajoutee apres le paiement.
        part: {
          findMany: () =>
            Promise.resolve([
              { quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(100) },
              { quantity: new Prisma.Decimal(3), unitPrice: new Prisma.Decimal(15) },
            ]),
        },
        invoice: {
          findUnique: () => Promise.resolve(paidInvoice),
          update: (args: any) => Promise.resolve({ ...paidInvoice, ...args.data }),
        },
        payment: {
          count: () => Promise.resolve(1),
          aggregate: () => Promise.resolve({ _sum: { amount: new Prisma.Decimal(300) } }),
        },
      }),
    );

    const updated = await service.update('garage-1', 'user-1', 'wo-1', {});

    expect(updated.partsTotal.toFixed(3)).toBe('145.000');
    expect(updated.totalPrice.toFixed(3)).toBe('345.000');
    expect(updated.status).toBe('PARTIALLY_PAID');
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
      invoice: { findUnique: () => Promise.resolve({ id: 'invoice-1', status: 'ISSUED', partsTotal: new Prisma.Decimal(0) }) },
    });
    const service = new InvoicesService(prisma);

    await expect(service.issue('garage-1', 'admin-1', 'wo-1')).rejects.toThrow(BadRequestException);
  });

  it('passe DRAFT -> ISSUED et fixe issuedById/issuedAt', async () => {
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({ id: 'invoice-1', status: 'DRAFT', partsTotal: new Prisma.Decimal(0), totalPrice: new Prisma.Decimal(830) }),
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

describe('InvoicesService.refund -- trop-percu', () => {
  const invoice = { id: 'invoice-1', workOrderId: 'wo-1', status: 'PAID', totalPrice: new Prisma.Decimal(300) };
  const make = (paid: number) =>
    new InvoicesService(
      makePrismaMock({
        invoice: { findUnique: () => Promise.resolve(invoice) },
        payment: {
          aggregate: () => Promise.resolve({ _sum: { amount: new Prisma.Decimal(paid) } }),
          create: (args: any) => Promise.resolve({ id: 'payment-2', ...args.data }),
        },
      }),
    );

  it('enregistre un Payment NEGATIF plafonne au trop-percu', async () => {
    const refund = await make(400).refund('garage-1', 'user-1', 'wo-1', { amount: 100, method: 'CASH' as any });
    expect(refund.amount.toString()).toBe('-100');
  });

  it('rejette un remboursement superieur au trop-percu, ou sans trop-percu', async () => {
    await expect(make(400).refund('garage-1', 'user-1', 'wo-1', { amount: 150, method: 'CASH' as any })).rejects.toThrow(
      BadRequestException,
    );
    await expect(make(300).refund('garage-1', 'user-1', 'wo-1', { amount: 10, method: 'CASH' as any })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('InvoicesService -- TVA et timbre fiscal', () => {
  it('create : HT + TVA 19 % + timbre 1,000 = TTC, copies sur la facture', async () => {
    let data: any = null;
    const prisma = makePrismaMock({
      part: { findMany: () => Promise.resolve([{ quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(500) }]) },
      garage: {
        findUnique: () =>
          Promise.resolve({ vatEnabled: true, vatRate: new Prisma.Decimal(19), stampDutyEnabled: true, stampDuty: new Prisma.Decimal(1), invoiceDueDays: 30 }),
      },
      invoice: {
        findUnique: () => Promise.resolve(null),
        create: (args: any) => ((data = args.data), Promise.resolve({ id: 'invoice-1', ...args.data })),
      },
    });
    await new InvoicesService(prisma).create('garage-1', 'user-1', 'wo-1', { laborPrice: 300 });
    expect(data.subtotal.toFixed(3)).toBe('800.000');
    expect(data.vatRate.toFixed(2)).toBe('19.00');
    expect(data.vatAmount.toFixed(3)).toBe('152.000');
    expect(data.stampDuty.toFixed(3)).toBe('1.000');
    expect(data.totalPrice.toFixed(3)).toBe('953.000');
    expect(data.dueDate).toBeInstanceOf(Date);
  });

  it("update : recalcule avec le taux et le timbre de la facture, pas ceux du garage", async () => {
    let data: any = null;
    const prisma = makePrismaMock({
      invoice: {
        findUnique: () =>
          Promise.resolve({
            id: 'invoice-1',
            status: 'DRAFT',
            laborPrice: new Prisma.Decimal(100),
            partsTotal: new Prisma.Decimal(0),
            vatRate: new Prisma.Decimal(7),
            stampDuty: new Prisma.Decimal(0.6),
            totalPrice: new Prisma.Decimal(107.6),
          }),
        update: (args: any) => ((data = args.data), Promise.resolve({ id: 'invoice-1', ...args.data })),
      },
    });
    await new InvoicesService(prisma).update('garage-1', 'user-1', 'wo-1', { laborPrice: 200.005 });
    expect(data.subtotal.toFixed(3)).toBe('200.005');
    expect(data.vatAmount.toFixed(3)).toBe('14.000'); // 14.00035 arrondi au millime
    expect(data.totalPrice.toFixed(3)).toBe('214.605');
  });
});
