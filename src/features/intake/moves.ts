import "server-only";
import { addTab, deleteRow, listTabs, readTab, writeRow } from "@/lib/google/sheets";
import {
  ARCHIVE_TAB,
  INCOMING_TAB,
  MONTH_TAB_HEADER,
  buildRowForHeader,
  findRowByFingerprint,
  firstEmptyRow,
  monthTabOrder,
  monthTabTitle,
  rowToFields,
} from "./sheet";
import { forgetIncoming } from "./queries";

/**
 * The sheet side of Create and Dismiss: copy the row to its destination,
 * then delete it from Incoming. Append first, delete second, so a failure in
 * between leaves a duplicate (harmless, visible) rather than a lost row.
 * Everything here is idempotent on the fingerprint so a retry can finish a
 * half-done move.
 */

export type MoveResult = { ok: true; tab: string } | { ok: false; error: string };

/** The month tab for "now", created from the newest month tab's header if it doesn't exist yet. */
async function ensureMonthTab(): Promise<{ title: string; sheetId: number }> {
  const title = monthTabTitle();
  const tabs = await listTabs();
  const existing = tabs.find((t) => t.title.trim().toLowerCase() === title.toLowerCase());
  if (existing) return { title: existing.title, sheetId: existing.sheetId };

  // New tabs go right after Incoming Watches, where the newest month lives.
  const incoming = tabs.find((t) => t.title === INCOMING_TAB);
  const index = incoming ? incoming.index + 1 : 2;
  const newest = tabs.filter((t) => monthTabOrder(t.title) >= 0).sort((a, b) => monthTabOrder(b.title) - monthTabOrder(a.title))[0];
  const header = newest ? (await readTab(newest.title))[0] ?? MONTH_TAB_HEADER : MONTH_TAB_HEADER;
  const sheetId = await addTab(title, index);
  await writeRow(title, 1, header);
  return { title, sheetId };
}

/** Move the Incoming row with this fingerprint to the current month tab (Create) or Archive (Dismiss). */
export async function moveIncomingRow(fingerprint: string, destination: "month" | "archive"): Promise<MoveResult> {
  try {
    const tabs = await listTabs();
    const incomingTab = tabs.find((t) => t.title === INCOMING_TAB);
    if (!incomingTab) return { ok: false, error: `The sheet has no "${INCOMING_TAB}" tab.` };

    const dest = destination === "month"
      ? await ensureMonthTab()
      : (() => { const a = tabs.find((t) => t.title === ARCHIVE_TAB); return a ? { title: a.title, sheetId: a.sheetId } : null; })();
    if (!dest) return { ok: false, error: `The sheet has no "${ARCHIVE_TAB}" tab.` };

    // Fresh read: positions move whenever anyone edits the sheet.
    const incoming = await readTab(INCOMING_TAB);
    const srcRow = findRowByFingerprint(incoming, fingerprint);
    const destValues = await readTab(dest.title);
    const alreadyThere = findRowByFingerprint(destValues, fingerprint) !== null;

    if (srcRow === null) {
      // Nothing left to move: either an earlier attempt finished, or someone moved it by hand.
      forgetIncoming();
      return alreadyThere ? { ok: true, tab: dest.title } : { ok: false, error: "The row is no longer in Incoming Watches and was not found in the destination tab." };
    }

    if (!alreadyThere) {
      const fields = rowToFields(incoming[0], incoming[srcRow - 1]);
      const destHeader = destValues[0] ?? MONTH_TAB_HEADER;
      await writeRow(dest.title, firstEmptyRow(destValues), buildRowForHeader(destHeader, fields));
    }
    await deleteRow(incomingTab.sheetId, srcRow);
    forgetIncoming();
    return { ok: true, tab: dest.title };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Google Sheets: ${msg}` };
  }
}
