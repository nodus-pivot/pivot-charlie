import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TEST_KINDS, type Stage, type TestKind } from "@/features/pipeline";
import type { BenchRow } from "./bench";

/**
 * Every open (or closed) ticket in the workspace from the board view, plus
 * which checks are still to run on tickets at Test. RLS trims the rows.
 */
export async function listBench(workspaceId: string, view: "open" | "closed"): Promise<BenchRow[]> {
  const supabase = await createClient();
  let q = supabase.from("ticket_board").select("*").eq("workspace_id", workspaceId);
  q = view === "closed" ? q.eq("stage", "closed").order("closed_at", { ascending: false }) : q.neq("stage", "closed");
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];

  const testIds = rows.filter((r) => r.stage === "test").map((r) => r.id!);
  const { data: tests } = testIds.length
    ? await supabase.from("ticket_tests").select("ticket_id, attempt, kind, result").in("ticket_id", testIds)
    : { data: [] as { ticket_id: string; attempt: number; kind: string; result: string }[] };
  const attemptBy = new Map(rows.map((r) => [r.id!, r.test_attempt ?? 1]));
  const passedBy = new Map<string, Set<string>>();
  for (const t of tests ?? []) {
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
    watch: r.watch ?? "",
    priority: !!r.priority,
    needs_payment: !!r.needs_payment,
    payment_amount: r.payment_amount,
    invoice_sent_at: r.invoice_sent_at,
    payment_received: !!r.payment_received,
    return_to_everett: !!r.return_to_everett,
    coverage: r.coverage,
    stage_entered_at: r.stage_entered_at!,
    closed_at: r.closed_at,
    parked: !!r.parked,
    waiting_for_parts: !!r.waiting_for_parts,
    parts_requested_at: r.parts_requested_at,
    parts_list: r.parts_list,
    awaiting_payment: !!r.awaiting_payment,
    tests_passed: r.tests_passed ?? 0,
    ship_ready: !!r.ship_ready,
    outcome: r.outcome,
    shipped_by: r.shipped_by,
    received_at: r.received_at,
    slack_replies: r.slack_replies,
    bench_photo_path: r.bench_photo_path,
    tests_left: r.stage === "test" ? (TEST_KINDS.filter((k) => !(passedBy.get(r.id!) ?? new Set()).has(k)) as TestKind[]) : [],
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
