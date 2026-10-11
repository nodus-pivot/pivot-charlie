import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { columnLetter, readTab, writeCell } from "@/lib/google/sheets";
import { findRowByFingerprint, headerIndex, rowToFields, fingerprint } from "./sheet";

/**
 * Drains sheet_writebacks: for each pending cell, find the ticket's row in
 * its month tab by fingerprint and write that one cell. Runs with the
 * service role (the queue table has no write policy for people), after the
 * actions that queue cells and from the manual "Sync sheet" button.
 *
 * Only the four agreed columns are ever written: Solution, Payment
 * Received?, Repair Completed?, Shipped Back?. Anything else is marked
 * failed without touching the sheet.
 */

const ALLOWED = new Set(["Solution", "Payment Received?", "Repair Completed?", "Shipped Back?"]);
const MAX_ATTEMPTS = 5;

export type DrainResult = { applied: number; skipped: number; failed: { ticket: string; column: string; error: string }[] };

export async function drainWritebacks(opts: { ticketId?: string } = {}): Promise<DrainResult> {
  const admin = createAdminClient();
  let q = admin
    .from("sheet_writebacks")
    .select("id, ticket_id, column_name, value, attempts, created_at, ticket:tickets(number, sheet_row_id, sheet_row:sheet_rows(raw, moved_to_tab, moved_at))")
    .eq("status", "pending")
    .order("created_at");
  if (opts.ticketId) q = q.eq("ticket_id", opts.ticketId);
  const { data: rows, error } = await q;
  if (error || !rows?.length) return { applied: 0, skipped: 0, failed: error ? [{ ticket: "-", column: "-", error: error.message }] : [] };

  const result: DrainResult = { applied: 0, skipped: 0, failed: [] };
  const tabs = new Map<string, string[][]>();
  const readTabOnce = async (title: string) => {
    if (!tabs.has(title)) tabs.set(title, await readTab(title));
    return tabs.get(title)!;
  };

  // Same ticket + column queued more than once: only the newest value matters.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) latest.set(`${r.ticket_id}|${r.column_name}`, r);

  for (const r of rows) {
    const ticket = r.ticket as unknown as { number: string; sheet_row_id: string | null; sheet_row: { raw: Record<string, string>; moved_to_tab: string | null; moved_at: string | null } | null } | null;
    const key = `${r.ticket_id}|${r.column_name}`;
    if (latest.get(key)?.id !== r.id) {
      await admin.from("sheet_writebacks").update({ status: "done", done_at: new Date().toISOString(), last_error: "superseded" }).eq("id", r.id);
      result.skipped++;
      continue;
    }
    const fail = async (msg: string, final = false) => {
      const attempts = (r.attempts ?? 0) + 1;
      await admin.from("sheet_writebacks").update({ attempts, last_error: msg, status: final || attempts >= MAX_ATTEMPTS ? "failed" : "pending" }).eq("id", r.id);
      result.failed.push({ ticket: ticket?.number ?? r.ticket_id, column: r.column_name, error: msg });
    };

    if (!ALLOWED.has(r.column_name)) { await fail(`column "${r.column_name}" is not one Pivot writes`, true); continue; }
    if (!ticket?.sheet_row) { await fail("ticket has no sheet row", true); continue; }
    if (!ticket.sheet_row.moved_to_tab || !ticket.sheet_row.moved_at) { await fail("the row has not been moved to a month tab yet"); continue; }

    try {
      const values = await readTabOnce(ticket.sheet_row.moved_to_tab);
      const header = values[0] ?? [];
      const col = headerIndex(header).get(r.column_name.toLowerCase());
      if (col === undefined) { await fail(`"${r.column_name}" column not found in ${ticket.sheet_row.moved_to_tab}`); continue; }
      const raw = ticket.sheet_row.raw;
      const fp = fingerprint(rowToFields(Object.keys(raw), Object.values(raw)));
      const rowNumber = findRowByFingerprint(values, fp);
      if (rowNumber === null) { await fail(`row not found in ${ticket.sheet_row.moved_to_tab} (was it edited by hand?)`); continue; }
      await writeCell(ticket.sheet_row.moved_to_tab, `${columnLetter(col)}${rowNumber}`, r.value);
      // keep the in-memory tab current for later rows of this drain
      values[rowNumber - 1] = values[rowNumber - 1] ?? [];
      values[rowNumber - 1][col] = r.value;
      await admin.from("sheet_writebacks").update({ status: "done", done_at: new Date().toISOString(), attempts: (r.attempts ?? 0) + 1, last_error: null }).eq("id", r.id);
      result.applied++;
    } catch (e) {
      await fail(`Google Sheets: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/** Fire-and-forget form used after stage actions: never throws, never blocks the UI on Google. */
export async function drainQuietly(ticketId: string): Promise<void> {
  try {
    await drainWritebacks({ ticketId });
  } catch {
    /* the queue keeps the rows; the next drain retries */
  }
}
