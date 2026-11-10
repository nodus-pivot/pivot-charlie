/** Stripe caps an invoice memo (description) at 500 characters. */
export const INVOICE_MEMO_MAX = 500;

/**
 * The customer-facing memo typed on the Payment step, trimmed and clipped
 * for Stripe's Memo field and the payment email's "What this covers".
 * Null when nothing was written.
 */
export function invoiceMemo(notes: string | null | undefined): string | null {
  const text = (notes ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return null;
  return text.length > INVOICE_MEMO_MAX ? `${text.slice(0, INVOICE_MEMO_MAX - 1)}…` : text;
}
