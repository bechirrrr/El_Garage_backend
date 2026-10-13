import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { autoIssueInvoiceOnCompletion } from './invoice-auto-issue.js';

const D = (v: number | string) => new Prisma.Decimal(v);
const ctx = { garageId: 'garage-1', workOrderId: 'wo-1', customerId: 'customer-1', actorId: 'user-1' };

function makeTx(existing: any) {
  const calls: { create: any[]; update: any[]; events: any[] } = { create: [], update: [], events: [] };
  const tx = {
    invoice: {
      findUnique: () => Promise.resolve(existing),
      create: (args: any) => (calls.create.push(args.data), Promise.resolve(args.data)),
      update: (args: any) => (calls.update.push(args.data), Promise.resolve(args.data)),
    },
    part: { findMany: () => Promise.resolve([{ quantity: D(2), unitPrice: D('50.000') }]) },
    garage: {
      findUnique: () =>
        Promise.resolve({ vatEnabled: true, vatRate: D(19), stampDutyEnabled: true, stampDuty: D('1.000'), invoiceDueDays: 0 }),
    },
    activityEvent: { create: (args: any) => (calls.events.push(args.data), Promise.resolve({})) },
  };
  return { tx, calls };
}

describe('autoIssueInvoiceOnCompletion -- OR termine => facture Non payee', () => {
  it('cree une facture ISSUED avec les pieces, la TVA et le timbre du garage', async () => {
    const { tx, calls } = makeTx(null);
    await autoIssueInvoiceOnCompletion(tx, ctx);
    const data = calls.create[0];
    expect(data.status).toBe('ISSUED');
    expect(data.partsTotal.toFixed(3)).toBe('100.000');
    expect(data.totalPrice.toFixed(3)).toBe('120.000'); // 100 + 19 % + 1 timbre
    expect(calls.events[0].type).toBe('INVOICE_ISSUED');
  });

  it('emet un brouillon existant en gardant sa main-d oeuvre', async () => {
    const { tx, calls } = makeTx({ id: 'inv-1', status: 'DRAFT', laborPrice: D(30), vatRate: D(0), stampDuty: D(0), dueDate: null });
    await autoIssueInvoiceOnCompletion(tx, ctx);
    expect(calls.update[0].status).toBe('ISSUED');
    expect(calls.update[0].totalPrice.toFixed(3)).toBe('130.000');
  });

  it('ne touche pas une facture deja emise ou payee', async () => {
    for (const status of ['ISSUED', 'PARTIALLY_PAID', 'PAID']) {
      const { tx, calls } = makeTx({ id: 'inv-1', status });
      await autoIssueInvoiceOnCompletion(tx, ctx);
      expect(calls.create.length + calls.update.length + calls.events.length).toBe(0);
    }
  });
});
