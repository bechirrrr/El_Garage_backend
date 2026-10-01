import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DiagnosisService } from './diagnosis.service.js';

function makePrismaMock(overrides: Record<string, any> = {}) {
  const base = {
    workOrder: {
      findUnique: () =>
        Promise.resolve({
          id: 'wo-1',
          garageId: 'garage-1',
          createdById: 'mechanic-1',
          problemReported: 'Vibration au freinage',
        }),
    },
    diagnosis: {
      findUnique: () => Promise.resolve(null),
      upsert: (args: any) => Promise.resolve({ id: 'diagnosis-1', ...args.create, ...args.update }),
    },
    symptom: {
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'symptom-1', checked: false, ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    diagnosticTest: {
      findUnique: () => Promise.resolve(null),
      create: (args: any) => Promise.resolve({ id: 'test-1', performed: false, ...args.data }),
      update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      delete: (args: any) => Promise.resolve({ id: args.where.id }),
    },
    activityEvent: { create: () => Promise.resolve({}) },
    ...overrides,
  };
  return { ...base, $transaction: (fn: (tx: any) => any) => fn(base) } as any;
}

describe('DiagnosisService.upsert -- restriction Mecanicien (Section 20)', () => {
  it("rejette si un MECHANIC modifie le diagnostic d'un ticket qu'il n'a pas cree", async () => {
    const prisma = makePrismaMock({
      workOrder: {
        findUnique: () =>
          Promise.resolve({ id: 'wo-1', garageId: 'garage-1', createdById: 'other-mechanic' }),
      },
    });
    const service = new DiagnosisService(prisma);

    await expect(
      service.upsert('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', { findings: 'x' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('distingue DIAGNOSIS_STARTED (premiere fois) et DIAGNOSIS_UPDATED (ensuite)', async () => {
    const events: any[] = [];
    const prisma = makePrismaMock({
      diagnosis: {
        findUnique: () => Promise.resolve(null), // pas encore de diagnostic
        upsert: (args: any) => Promise.resolve({ id: 'diagnosis-1', ...args.create }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new DiagnosisService(prisma);

    await service.upsert('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      customerComplaint: 'Vibration',
    });

    expect(events[0].type).toBe('DIAGNOSIS_STARTED');
  });

  it("derive customerComplaint depuis WorkOrder.problemReported quand il n'est pas fourni explicitement", async () => {
    const prisma = makePrismaMock({
      diagnosis: {
        findUnique: () => Promise.resolve(null),
        upsert: (args: any) => Promise.resolve({ id: 'diagnosis-1', ...args.create }),
      },
    });
    const service = new DiagnosisService(prisma);

    const result = await service.upsert('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      findings: 'Plaquettes usees',
    });

    expect(result.customerComplaint).toBe('Vibration au freinage');
  });

  it('respecte un customerComplaint fourni explicitement plutot que celui du WorkOrder', async () => {
    const prisma = makePrismaMock({
      diagnosis: {
        findUnique: () => Promise.resolve(null),
        upsert: (args: any) => Promise.resolve({ id: 'diagnosis-1', ...args.create }),
      },
    });
    const service = new DiagnosisService(prisma);

    const result = await service.upsert('garage-1', 'mechanic-1', 'MECHANIC' as any, 'wo-1', {
      customerComplaint: 'Reformulation du mecanicien',
    });

    expect(result.customerComplaint).toBe('Reformulation du mecanicien');
  });

  it("logge DIAGNOSIS_UPDATED quand un diagnostic existe deja", async () => {
    const events: any[] = [];
    const prisma = makePrismaMock({
      diagnosis: {
        findUnique: () => Promise.resolve({ id: 'diagnosis-1', workOrderId: 'wo-1' }),
        upsert: (args: any) => Promise.resolve({ id: 'diagnosis-1', ...args.update }),
      },
      activityEvent: {
        create: (args: any) => {
          events.push(args.data);
          return Promise.resolve({});
        },
      },
    });
    const service = new DiagnosisService(prisma);

    await service.upsert('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', { findings: 'Injecteur #3' });

    expect(events[0].type).toBe('DIAGNOSIS_UPDATED');
  });
});

describe('DiagnosisService checklists', () => {
  it("rejette l'ajout d'un symptome si aucun diagnostic n'existe encore pour ce ticket", async () => {
    const prisma = makePrismaMock({
      diagnosis: { findUnique: () => Promise.resolve(null) },
    });
    const service = new DiagnosisService(prisma);

    await expect(
      service.addSymptom('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', { label: 'Bruit moteur' }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejette la modification d'un symptome appartenant a un autre diagnostic", async () => {
    const prisma = makePrismaMock({
      diagnosis: { findUnique: () => Promise.resolve({ id: 'diagnosis-1' }) },
      symptom: {
        findUnique: () => Promise.resolve({ id: 'symptom-1', diagnosisId: 'diagnosis-OTHER' }),
      },
    });
    const service = new DiagnosisService(prisma);

    await expect(
      service.updateSymptom('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'symptom-1', {
        checked: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('coche un symptome existant du bon diagnostic', async () => {
    const prisma = makePrismaMock({
      diagnosis: { findUnique: () => Promise.resolve({ id: 'diagnosis-1' }) },
      symptom: {
        findUnique: () => Promise.resolve({ id: 'symptom-1', diagnosisId: 'diagnosis-1' }),
        update: (args: any) => Promise.resolve({ id: args.where.id, ...args.data }),
      },
    });
    const service = new DiagnosisService(prisma);

    const result = await service.updateSymptom('garage-1', 'admin-1', 'ADMIN' as any, 'wo-1', 'symptom-1', {
      checked: true,
    });

    expect(result.checked).toBe(true);
  });
});
