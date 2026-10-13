/**
 * Immatriculations tunisiennes acceptees :
 *  - serie normale : 1 a 3 chiffres + "TU" + 1 a 4 chiffres  (ex: 203 TU 5561)
 *  - regime suspensif : "RS" + 1 a 6 chiffres                (ex: RS 123456)
 *
 * Espaces et casse libres a la saisie ; on enregistre toujours la forme
 * canonique ("203 TU 5561" / "RS 123456") pour que l'unicite par garage
 * ne depende pas de la facon de taper.
 */
const TU_PLATE = /^(\d{1,3})TU(\d{1,4})$/;
const RS_PLATE = /^RS(\d{1,6})$/;

/** Forme canonique, ou null si la saisie ne correspond a aucun format. */
export function normalizePlate(input: string): string | null {
  const compact = input.replace(/\s/g, '').toUpperCase();
  const tu = TU_PLATE.exec(compact);
  if (tu) return `${tu[1]} TU ${tu[2]}`;
  const rs = RS_PLATE.exec(compact);
  if (rs) return `RS ${rs[1]}`;
  return null;
}
