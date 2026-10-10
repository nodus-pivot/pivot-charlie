import "server-only";
import { createClient } from "@/lib/supabase/server";
import { COMPONENTS, type Stage } from "@/features/pipeline";
import type { BenchRow } from "./bench";

const TEST_KINDS = ["time", "water", "looks"] as const;

/**
 * Every open (or closed) ticket in the workspace from the board view, plus
 * the two per-ticket details the next-action labels need: components not
 * yet done on Fix, tests not yet passed on Test. RLS trims the rows.
 */
export async function listBench(workspaceId: string, view: "open" | "closed"): Promise<BenchRow[]> {
  const supabase = await createClient();
  let q = supabase.from("ticket_board").select("*").eq("workspace_id", workspaceId);
  q = view === "closed" ? q.eq("stage", "closed").order("closed_at", { ascending: false }) : q.neq("stage", "closed");
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];

  const fixIds = rows.filter((r) => r.stage === "fix").map((r) => r.id!);
  const testIds = rows.filter((r) => r.stage === "test").map((r) => r.id!);
  const [findings, tests, attempts] = await Promise.all([
    fixIds.length
      ? supabase.from("ticket_findings").select("ticket_id, component").in("ticket_id", fixIds).is("done_at", null)
      : Promise.resolve({ data: [] as { ticket_id: string; component: string }[] }),
    testIds.length
      ? supabase.from("ticket_tests").select("ticket_id, attempt, kind, result").in("ticket_id", testIds)
      : Promise.resolve({ data: [] as { ticket_id: string; attempt: number; kind: string; result: string }[] }),
    testIds.length
      ? supabase.from("tickets").select("id, test_attempt").in("id", testIds)
      : Promise.resolve({ data: [] as { id: string; test_attempt: number }[] }),
  ]);

  const undoneBy = new Map<string, string[]>();
  for (const f of findings.data ?? []) {
    undoneBy.set(f.ticket_id, [...(undoneBy.get(f.ticket_id) ?? []), f.component]);
  }
  const attemptBy = new Map((attempts.data ?? []).map((t) => [t.id, t.test_attempt]));
  const passedBy = new Map<string, Set<string>>();
  for (const t of tests.data ?? []) {
    if (t.result === "pass" && t.attempt === (attemptBy.get(t.ticket_id) ?? 1)) {
      passedBy.set(t.ticket_id, new Set([...(passedBy.get(t.ticket_id) ?? []), t.kind]));
    }
  }

  return rows.map((r) => ({
    id: r.id!,
    number: r.number!,
    stage: r.stage as Stage,
    workspace_id: r.workspace_id!,
    brand_id: r.brand_id!,
    customer_name: r.customer_name!,
    watch_name: r.watch_name!,
    priority: !!r.priority,
    needs_payment: !!r.needs_payment,
    payment_received: !!r.payment_received,
    return_to_everett: !!r.return_to_everett,
    stage_entered_at: r.stage_entered_at!,
    closed_at: r.closed_at,
    parked: !!r.parked,
    waiting_on: r.waiting_on,
    parts_requested_at: r.parts_requested_at,
    findings_total: r.findings_total ?? 0,
    findings_done: r.findings_done ?? 0,
    parts_total: r.parts_total ?? 0,
    parts_in_hand: r.parts_in_hand ?? 0,
    tests_passed: r.tests_passed ?? 0,
    ship_ready: !!r.ship_ready,
    bench_photo_path: r.bench_photo_path,
    undone: COMPONENTS.filter((c) => (undoneBy.get(r.id!) ?? []).includes(c)),
    tests_left: TEST_KINDS.filter((k) => !(passedBy.get(r.id!) ?? new Set()).has(k)),
  }));
}

/** Open and closed ticket counts for the Service Center tab strip. */
export async function countTickets(workspaceId: string): Promise<{ open: number; closed: number }> {
  const supabase = await createClient();
  const [o, c] = await Promise.all([
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).neq("stage", "closed"),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("stage", "closed"),
  ]);
  return { open: o.count ?? 0, closed: c.count ?? 0 };
}
