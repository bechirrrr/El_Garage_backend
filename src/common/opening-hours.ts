/** Un jour d'ouverture : "HH:MM" (24 h). Index 0 = lundi ... 6 = dimanche. */
export interface OpeningDay {
  open: boolean;
  from: string;
  to: string;
}

/** Horaires par defaut d'un garage (tant que l'admin ne les a pas regles). */
export const DEFAULT_OPENING_HOURS: OpeningDay[] = [
  { open: true, from: '08:00', to: '18:00' },
  { open: true, from: '08:00', to: '18:00' },
  { open: true, from: '08:00', to: '18:00' },
  { open: true, from: '08:00', to: '18:00' },
  { open: true, from: '08:00', to: '18:00' },
  { open: true, from: '08:00', to: '13:00' },
  { open: false, from: '08:00', to: '13:00' },
];

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes depuis minuit ("08:30" -> 510), null si invalide. */
export function toMinutes(t: string): number | null {
  const m = TIME.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Horaires valides : 7 jours, heures HH:MM, ouverture avant fermeture pour un jour ouvert. */
export function validOpeningHours(value: unknown): value is OpeningDay[] {
  if (!Array.isArray(value) || value.length !== 7) return false;
  return value.every((d) => {
    if (!d || typeof d !== 'object' || typeof d.open !== 'boolean') return false;
    const from = toMinutes(d.from);
    const to = toMinutes(d.to);
    if (from === null || to === null) return false;
    return !d.open || from < to;
  });
}

/** Horaires stockes (Json, null possible) -> 7 jours toujours definis. */
export function readOpeningHours(value: unknown): OpeningDay[] {
  return validOpeningHours(value) ? value : DEFAULT_OPENING_HOURS;
}
