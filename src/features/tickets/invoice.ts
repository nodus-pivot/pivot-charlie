/**
 * The Stripe line item: the watch and ticket, then what was reported, found,
 * fitted and done, one line each, from the step notes. Stripe caps a line
 * description at 500 characters.
 */
export function invoiceDescription(
  number: string,
  ticket: { watch: string; issue: string | null },
  steps: { stage: string; notes: string | null }[],
): string {
  const note = (stage: string) => steps.find((s) => s.stage === stage)?.notes?.trim() || null;
  const oneLine = (s: string | null) => (s ? s.split("\n").map((l) => l.trim()).filter(Boolean).join(", ") : null);
  const lines = [
    `${ticket.watch} · Ticket ${number}`,
    ticket.issue?.trim() ? `Reported: ${oneLine(ticket.issue)}` : null,
    note("inspect") ? `Found: ${oneLine(note("inspect"))}` : null,
    note("supply") ? `Parts: ${oneLine(note("supply"))}` : null,
    note("repair") ? `Work: ${oneLine(note("repair"))}` : null,
  ].filter((l): l is string => !!l);
  const text = lines.join("\n");
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}
