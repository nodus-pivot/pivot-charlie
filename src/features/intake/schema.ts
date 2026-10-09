import { z } from "zod";

/** Optional text: null, undefined and blanks all become null. */
const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(500)).transform((v) => v || null);

export const addressInput = z.object({
  line1: optional,
  line2: optional,
  city: optional,
  state: optional,
  postal_code: optional,
  country: optional,
});

/** What both intake forms send. `sheet` is present only from Incoming. */
export const ticketInput = z.object({
  brandId: z.uuid(),
  watchId: z.uuid({ message: "Pick a catalog model." }),
  customerName: z.string().trim().min(1, "Enter the customer's name.").max(200),
  customerEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  customerPhone: optional,
  shipTo: addressInput,
  modelText: optional,
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
