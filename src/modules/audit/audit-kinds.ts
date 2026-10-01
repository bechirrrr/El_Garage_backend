/**
 * Familles de changements affichees dans le Journal d'audit (Section 30bis),
 * a partir du `type` libre des ActivityEvent SENSITIVE.
 */
export const AUDIT_KINDS = {
  price: ['INVOICE_PRICE_UPDATED'],
  payment: ['PAYMENT_RECORDED'],
  status: ['STATUS_CHANGED'],
  assignment: ['MECHANIC_ASSIGNED'],
  invoice: ['INVOICE_CREATED', 'INVOICE_ISSUED', 'INVOICE_CANCELLED'],
  settings: ['GARAGE_SETTINGS_UPDATED'],
} as const;

export type AuditKind = keyof typeof AUDIT_KINDS;
export const AUDIT_KIND_NAMES = Object.keys(AUDIT_KINDS) as AuditKind[];

/** Famille d'un type d'evenement ('other' pour un type SENSITIVE futur non classe). */
export function kindOf(type: string): AuditKind | 'other' {
  for (const k of AUDIT_KIND_NAMES) {
    if ((AUDIT_KINDS[k] as readonly string[]).includes(type)) return k;
  }
  return 'other';
}

/** "Prix modifie apres paiement" : l'alerte de la Section 30bis. */
export function isAfterPaymentAlert(type: string, metadata: unknown): boolean {
  return type === 'INVOICE_PRICE_UPDATED' && !!metadata && (metadata as { afterPayment?: boolean }).afterPayment === true;
}
