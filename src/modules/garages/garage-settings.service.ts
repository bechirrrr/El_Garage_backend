import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { readOpeningHours, toMinutes, type OpeningDay } from '../../common/opening-hours.js';
import { ActivityCategory, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateGarageSettingsDto } from './dto/update-garage-settings.dto.js';

const SETTINGS_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  taxId: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  openingHours: true,
  mechanicHoursPerDay: true,
  defaultAppointmentMinutes: true,
  planningSlotMinutes: true,
  invoiceDueDays: true,
  invoiceFooter: true,
  vatEnabled: true,
  vatRate: true,
  stampDutyEnabled: true,
  stampDuty: true,
} as const;

type SettingsRow = Prisma.GarageGetPayload<{ select: typeof SETTINGS_SELECT }>;

/** Champs comparables (valeur "a plat") pour le journal d'audit. */
const TRACKED = [
  'name',
  'phone',
  'email',
  'address',
  'taxId',
  'openingHours',
  'mechanicHoursPerDay',
  'defaultAppointmentMinutes',
  'planningSlotMinutes',
  'invoiceDueDays',
  'invoiceFooter',
  'vatEnabled',
  'vatRate',
  'stampDutyEnabled',
  'stampDuty',
] as const;

/**
 * Parametres du garage (ecran Parametres). Lecture : tout membre du garage
 * (le planning et la charge en ont besoin). Ecriture : ADMIN seulement
 * (Section 29 : "Manage Garage settings"), tracee dans le journal d'audit.
 */
@Injectable()
export class GarageSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(garageId: string) {
    const garage = await this.prisma.garage.findUnique({ where: { id: garageId }, select: SETTINGS_SELECT });
    if (!garage) throw new NotFoundException('Garage introuvable.');
    return this.present(garage);
  }

  async update(garageId: string, actorId: string, dto: UpdateGarageSettingsDto) {
    const before = await this.prisma.garage.findUnique({ where: { id: garageId }, select: SETTINGS_SELECT });
    if (!before) throw new NotFoundException('Garage introuvable.');

    if (dto.openingHours) this.assertHours(dto.openingHours);
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

    const data: Prisma.GarageUpdateInput = {
      name: dto.name?.trim(),
      phone: clean(dto.phone),
      email: clean(dto.email),
      address: clean(dto.address),
      taxId: clean(dto.taxId),
      openingHours: dto.openingHours ? dto.openingHours.map((d) => ({ open: d.open, from: d.from, to: d.to })) : undefined,
      mechanicHoursPerDay: dto.mechanicHoursPerDay,
      defaultAppointmentMinutes: dto.defaultAppointmentMinutes,
      planningSlotMinutes: dto.planningSlotMinutes,
      invoiceDueDays: dto.invoiceDueDays,
      invoiceFooter: clean(dto.invoiceFooter),
      vatEnabled: dto.vatEnabled,
      vatRate: dto.vatRate === undefined ? undefined : new Prisma.Decimal(dto.vatRate),
      stampDutyEnabled: dto.stampDutyEnabled,
      stampDuty: dto.stampDuty === undefined ? undefined : new Prisma.Decimal(dto.stampDuty),
    };

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.garage.update({ where: { id: garageId }, data, select: SETTINGS_SELECT });
      const changes = this.diff(this.present(before), this.present(after));
      if (changes.length) {
        await tx.activityEvent.create({
          data: {
            garageId,
            actorId,
            type: 'GARAGE_SETTINGS_UPDATED',
            category: ActivityCategory.SENSITIVE,
            message: `Parametres du garage modifies : ${changes.map((c) => c.field).join(', ')}`,
            metadata: { changes } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return this.present(after);
    });
  }

  /** Forme renvoyee au frontend : montants en string, horaires toujours complets. */
  present(g: SettingsRow) {
    return {
      ...g,
      openingHours: readOpeningHours(g.openingHours),
      vatRate: g.vatRate.toFixed(2),
      stampDuty: g.stampDuty.toFixed(3),
    };
  }

  diff(before: ReturnType<GarageSettingsService['present']>, after: ReturnType<GarageSettingsService['present']>) {
    const out: { field: string; old: unknown; new: unknown }[] = [];
    for (const f of TRACKED) {
      const a = before[f];
      const b = after[f];
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: f, old: a, new: b });
    }
    return out;
  }

  private assertHours(days: OpeningDay[]) {
    days.forEach((d, i) => {
      const from = toMinutes(d.from);
      const to = toMinutes(d.to);
      if (d.open && (from === null || to === null || from >= to)) {
        const day = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][i];
        throw new BadRequestException(`Horaires du ${day} : l'ouverture doit etre avant la fermeture.`);
      }
    });
  }
}
