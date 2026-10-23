import { z } from "zod";
import { normalizeCountry } from "@/lib/country";

/** Optional text: null, undefined and blanks all become null. */
const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(500)).transform((v) => v || null);

/** Country: stored as an ISO code when recognised, as typed otherwise (flagged in the UI), US when blank. */
export const countryField = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(80)).transform((v) => {
  const r = normalizeCountry(v);
  return r.recognised ? r.code : r.raw || "US";
});

export const addressInput = z.object({
  line1: optional,
  line2: optional,
  city: optional,
  state: optional,
  postal_code: optional,
  country: countryField,
});

/** What both intake forms send. `sheet` is present only from Incoming. */
export const ticketInput = z.object({
  brandId: z.uuid(),
  watch: z.string().trim().min(1, "Which watch is it?").max(120),
  customerName: z.string().trim().min(1, "Enter the customer's name.").max(200),
  customerEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  customerPhone: optional,
  shipTo: addressInput,
  serial: optional,
  issue: z.string().trim().min(1, "What did the customer say?").max(5000),
  benchNote: optional,
  coverage: z.enum(["warranty", "paid"]).nullable(),
  priority: z.boolean(),
  needsPayment: z.boolean(),
  paymentAmount: z.number().nonnegative().nullable(),
  returnToEverett: z.boolean(),
  onBench: z.boolean(),
  claimRef: optional,
  sheet: z.object({ fingerprint: z.string().min(8), raw: z.record(z.string(), z.string()) }).nullable(),
});
export type TicketInput = z.infer<typeof ticketInput>;
