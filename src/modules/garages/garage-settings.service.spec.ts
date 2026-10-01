import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DEFAULT_OPENING_HOURS } from '../../common/opening-hours.js';
import { GarageSettingsService } from './garage-settings.service.js';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'garage-1',
    name: 'Atelier',
    phone: null,
    email: null,
    address: null,
    taxId: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    reviewedAt: null,
    openingHours: null,
    mechanicHoursPerDay: 8,
    defaultAppointmentMinutes: 60,
    planningSlotMinutes: 30,
    invoiceDueDays: 30,
    invoiceFooter: null,
    vatEnabled: true,
    vatRate: new Prisma.Decimal(19),
    stampDutyEnabled: true,
    stampDuty: new Prisma.Decimal(1),
    ...over,
  };
}

function mock(before: any, after: any) {
  const events: any[] = [];
  let updateData: any = null;
  const tx = {
    garage: { update: (args: any) => ((updateData = args.data), Promise.resolve(after)) },
    activityEvent: { create: (args: any) => (events.push(args.data), Promise.resolve({})) },
  };
  return {
    events,
    get data() {
      return updateData;
    },
    prisma: {
      garage: { findUnique: () => Promise.resolve(before) },
      $transaction: (fn: any) => fn(tx),
    } as any,
  };
}

describe('GarageSettingsService', () => {
  it('find : horaires par defaut quand rien n est regle, montants en string', async () => {
    const m = mock(row(), row());
    const s = await new GarageSettingsService(m.prisma).find('garage-1');
    expect(s.openingHours).toEqual(DEFAULT_OPENING_HOURS);
    expect(s.vatRate).toBe('19.00');
    expect(s.stampDuty).toBe('1.000');
  });

  it('update : trace les champs modifies dans le journal d audit (SENSITIVE)', async () => {
    const m = mock(row(), row({ vatRate: new Prisma.Decimal(7), phone: '71 000 000' }));
    await new GarageSettingsService(m.prisma).update('garage-1', 'admin-1', { vatRate: 7, phone: '71 000 000' });
    expect(m.events).toHaveLength(1);
    expect(m.events[0].type).toBe('GARAGE_SETTINGS_UPDATED');
    expect(m.events[0].category).toBe('SENSITIVE');
    expect(m.events[0].metadata.changes.map((c: any) => c.field).sort()).toEqual(['phone', 'vatRate']);
  });

  it('update sans changement : aucune ligne d audit', async () => {
    const m = mock(row(), row());
    await new GarageSettingsService(m.prisma).update('garage-1', 'admin-1', { name: 'Atelier' });
    expect(m.events).toHaveLength(0);
  });

  it('refuse un jour ouvert dont la fermeture precede l ouverture', async () => {
    const m = mock(row(), row());
    const hours = DEFAULT_OPENING_HOURS.map((d) => ({ ...d }));
    hours[2] = { open: true, from: '18:00', to: '08:00' };
    await expect(new GarageSettingsService(m.prisma).update('garage-1', 'admin-1', { openingHours: hours })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('champs texte vides -> null', async () => {
    const m = mock(row({ phone: '71' }), row());
    await new GarageSettingsService(m.prisma).update('garage-1', 'admin-1', { phone: '  ' });
    expect(m.data.phone).toBeNull();
  });
});
