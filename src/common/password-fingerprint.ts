import { createHash } from 'node:crypto';

/**
 * Empreinte courte du hash de mot de passe, placee dans le JWT (claim `pv`).
 *
 * A chaque requete, JwtStrategy recalcule l'empreinte depuis la base et la
 * compare a celle du token : des que le mot de passe change, tous les
 * tokens emis AVANT deviennent invalides (session volee, poste partage...).
 * Aucune colonne ni migration : l'empreinte derive du passwordHash existant.
 * Ce n'est pas le hash lui-meme (16 caracteres d'un SHA-256 du hash bcrypt) :
 * elle ne permet pas de retrouver ni de tester un mot de passe.
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}
