/** Notes the repair breakdown is built from: the step notes, keyed by stage. */
export type RepairNotes = { inspect?: string | null; supply?: string | null; repair?: string | null };

/**
 * What was reported, found, fitted and done, one line each, from the ticket
 * and the step notes. Empty sections are dropped. Used for the Stripe line
 * item and the payment-request email's "What this covers".
 */
export function repairLines(issue: string | null | undefined, notes: RepairNotes): string[] {
  const oneLine = (s: string | null | undefined) => (s ? s.split("\n").map((l) => l.trim()).filter(Boolean).join(", ") : "");
  return [
    ["Reported", oneLine(issue)],
    ["Found", oneLine(notes.inspect)],
    ["Parts", oneLine(notes.supply)],
    ["Work", oneLine(notes.repair)],
  ]
    .filter(([, text]) => text)
    .map(([label, text]) => `${label}: ${text}`);
}

/** Step rows as the database returns them, folded to RepairNotes. */
export function notesByStage(steps: { stage: string; notes: string | null }[]): RepairNotes {
  const get = (stage: string) => steps.find((s) => s.stage === stage)?.notes ?? null;
  return { inspect: get("inspect"), supply: get("supply"), repair: get("repair") };
}

/**
 * The Stripe line item: the watch and ticket, then the repair lines. Stripe
 * caps a line description at 500 characters.
 */
export function invoiceDescription(number: string, ticket: { watch: string; issue: string | null }, steps: { stage: string; notes: string | null }[]): string {
  const text = [`${ticket.watch} · Ticket ${number}`, ...repairLines(ticket.issue, notesByStage(steps))].join("\n");
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}
