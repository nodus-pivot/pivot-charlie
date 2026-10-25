import "server-only";
import Stripe from "stripe";

/**
 * The one Stripe client, on the restricted key in STRIPE_API. Invoices are
 * created with collection_method send_invoice and never emailed by Stripe:
 * Pivot shows the hosted pay link and the customer gets it from us.
 */

export const INVOICE_DAYS_UNTIL_DUE = 7;

function client(): Stripe {
  const key = process.env.STRIPE_API?.trim();
  if (!key) throw new Error("Stripe is not configured (STRIPE_API).");
  return new Stripe(key);
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_API?.trim();
}

/** Stripe's customer for this email, or a new one. */
export async function findOrCreateCustomer(name: string, email: string): Promise<string> {
  const stripe = client();
  const found = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const c = await stripe.customers.create({ name, email });
  return c.id;
}

export type CreatedInvoice = { id: string; url: string; dueAt: string };

/** Create, itemise and finalize an invoice the customer pays on Stripe's hosted page. */
export async function createInvoice(customer: string, amount: number, description: string, ticketNumber: string): Promise<CreatedInvoice> {
  const stripe = client();
  const inv = await stripe.invoices.create({
    customer,
    collection_method: "send_invoice",
    days_until_due: INVOICE_DAYS_UNTIL_DUE,
    auto_advance: false,
    description: ticketNumber,
    metadata: { ticket: ticketNumber },
  });
  await stripe.invoiceItems.create({ customer, invoice: inv.id, amount: Math.round(amount * 100), currency: "usd", description });
  const final = await stripe.invoices.finalizeInvoice(inv.id);
  if (!final.hosted_invoice_url) throw new Error("Stripe returned no payment link.");
  const due = final.due_date ? new Date(final.due_date * 1000) : new Date(Date.now() + INVOICE_DAYS_UNTIL_DUE * 86_400_000);
  return { id: final.id, url: final.hosted_invoice_url, dueAt: due.toISOString() };
}

export type InvoiceLookup = { status: "open" | "paid" | "void"; paidAt: string | null };

/** Stripe's view of an invoice, folded to the three states Pivot tracks. */
export async function fetchInvoice(id: string): Promise<InvoiceLookup> {
  const stripe = client();
  const inv = await stripe.invoices.retrieve(id);
  if (inv.status === "paid") {
    const paid = inv.status_transitions?.paid_at;
    return { status: "paid", paidAt: paid ? new Date(paid * 1000).toISOString() : new Date().toISOString() };
  }
  if (inv.status === "void" || inv.status === "uncollectible") return { status: "void", paidAt: null };
  return { status: "open", paidAt: null };
}

/** Error text safe to store on the row and show to nobody: codes, not secrets. */
export function stripeError(e: unknown): string {
  if (e instanceof Stripe.errors.StripeError) return [e.type, e.code, e.message].filter(Boolean).join(" · ").slice(0, 500);
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
