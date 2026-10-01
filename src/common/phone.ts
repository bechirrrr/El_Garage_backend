/**
 * Forme canonique d'un numero de telephone utilise comme identifiant de
 * connexion : on retire espaces, points, tirets et parentheses, on garde
 * les chiffres et un + initial. "24 660 912" et "24-660-912" donnent donc
 * tous les deux "24660912" -- a la creation du compte comme au login.
 */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s.\-()]/g, '');
}

/** 8 a 15 chiffres, avec un + optionnel devant (ex. 24660912, +21624660912). */
export const PHONE_PATTERN = /^\+?\d{8,15}$/;
