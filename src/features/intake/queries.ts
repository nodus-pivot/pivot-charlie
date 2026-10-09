import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { readTab } from "@/lib/google/sheets";
import { INCOMING_TAB, parseIncoming, type CatalogWatch, type IncomingRow } from "./sheet";

/**
 * Reads of the Incoming tab. The sheet is read whole and kept for a short
 * while per server instance; "Refresh" bypasses it. The ledger (sheet_rows)
 * hides what Pivot already acted on.
 */

const TTL_MS = 60_000;
let memo: { at: number; values: string[][] } | null = null;
let inflight: Promise<string[][]> | null = null;

export async function readIncomingValues(force = false): Promise<{ values: string[][]; syncedAt: Date; stale: boolean }> {
  const now = Date.now();
  if (!force && memo && now - memo.at < TTL_MS) return { values: memo.values, syncedAt: new Date(memo.at), stale: false };
  try {
    if (!inflight) inflight = readTab(INCOMING_TAB).finally(() => { inflight = null; });
    const values = await inflight;
    memo = { at: Date.now(), values };
    return { values, syncedAt: new Date(memo.at), stale: false };
  } catch (e) {
    if (memo) return { values: memo.values, syncedAt: new Date(memo.at), stale: true };
    throw e;
  }
}

export function forgetIncoming(): void {
  memo = null;
}

export type IncomingQueue = {
  rows: IncomingRow[];
  syncedAt: Date;
  stale: boolean;
  /** Ledger rows whose sheet move did not finish. Shown as a notice with Retry. */
  pendingMoves: { id: string; fingerprint: string; status: "imported" | "dismissed"; name: string }[];
  catalog: CatalogWatch[];
};

export const getCatalog = cache(async (brandId: string): Promise<CatalogWatch[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("watches").select("id, name, warranty_months").eq("brand_id", brandId).eq("is_active", true).order("name");
  return data ?? [];
});

export async function listIncoming(workspaceId: string, brandId: string, opts: { force?: boolean } = {}): Promise<IncomingQueue> {
  const supabase = await createClient();
  const [{ values, syncedAt, stale }, catalog, { data: ledger }] = await Promise.all([
    readIncomingValues(opts.force),
    getCatalog(brandId),
    supabase.from("sheet_rows").select("id, fingerprint, status, moved_at, raw").eq("workspace_id", workspaceId),
  ]);
  const acted = new Set((ledger ?? []).map((r) => r.fingerprint));
  const rows = parseIncoming(values, catalog).filter((r) => !acted.has(r.fingerprint));
  const pendingMoves = (ledger ?? [])
    .filter((r) => r.moved_at === null)
    .map((r) => ({ id: r.id, fingerprint: r.fingerprint, status: r.status, name: ((r.raw as Record<string, string>)?.Name ?? "a row").toString() }));
  return { rows, syncedAt, stale, pendingMoves, catalog };
}

/** For the My bench tab count. Null when the sheet can't be reached, so the bench still renders. */
export async function countIncoming(workspaceId: string, brandId: string): Promise<number | null> {
  try {
    const q = await listIncoming(workspaceId, brandId);
    return q.rows.length;
  } catch {
    return null;
  }
}
