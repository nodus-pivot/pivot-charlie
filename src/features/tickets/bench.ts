import { STAGES, STAGE_LABELS, TEST_LABELS, canActOn, type Grant, type Stage, type TestKind } from "@/features/pipeline";
import { daysBetween, formatDate } from "@/lib/format";

/**
 * My bench (D0), the pure part: takes board rows and returns stats, filter
 * counts and groups. No React, no Supabase.
 */

export type BenchRow = {
  id: string;
  number: string;
  stage: Stage;
  workspace_id: string;
  brand_id: string;
  customer_name: string;
  watch: string;
  priority: boolean;
  needs_payment: boolean;
  payment_amount: number | null;
  invoice_sent_at: string | null;
  payment_received: boolean;
  return_to_everett: boolean;
  coverage: "warranty" | "paid" | null;
  stage_entered_at: string;
  closed_at: string | null;
  /** Inspect answered No: cannot replicate. */
  parked: boolean;
  /** Supply answered No and the parts request is out. */
  waiting_for_parts: boolean;
  parts_requested_at: string | null;
  parts_list: string | null;
  awaiting_payment: boolean;
  tests_passed: number;
  ship_ready: boolean;
  outcome: string | null;
  shipped_by: string | null;
  received_at: string | null;
  slack_replies: number | null;
  bench_photo_path: string | null;
  /** Test kinds without a pass in the current attempt. Empty outside Test. */
  tests_left: TestKind[];
};

export const ATTENTION_DAYS = 14;
export const AGE_BAR_MAX_DAYS = 30;

export type BenchFilter = "all" | "needs_me" | "parked" | "priority" | "payment";
export const BENCH_FILTERS: { key: BenchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_me", label: "Needs me" },
  { key: "parked", label: "Parked" },
  { key: "priority", label: "Priority" },
  { key: "payment", label: "Payment" },
];

export type BenchSort = "oldest" | "newest";

export type NextAction = { label: string; emphasis?: boolean };

export type BenchTicket = BenchRow & {
  days: number;
  /** Either kind of parked: cannot replicate, or waiting on parts. */
  isParked: boolean;
  needsMe: boolean;
  attention: boolean;
  next: NextAction;
  /** "3 of 3" on Test; the progress fragment after the step name. */
  progress: string | null;
  /** The row's amber / coral / gold tag line, if any. */
  tag: { text: string; tone: "amber" | "coral" | "gold" } | null;
};

export type BenchGroup = { key: string; label: string; count: number; note?: string; tickets: BenchTicket[] };

export type BenchStats = {
  needsYou: { count: number; note: string };
  parked: { count: number; note: string };
  over14: { count: number; note: string };
  awaitingPayment: { count: number; note: string };
};

export type Bench = {
  stats: BenchStats;
  counts: Record<BenchFilter, number>;
  groups: BenchGroup[];
  total: number;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The single next action on the row's right, per the handoff's D0. */
export function nextAction(t: BenchRow): NextAction {
  switch (t.stage) {
    case "check_in":
      return { label: "I have the watch" };
    case "inspect":
      return t.parked ? { label: "Open ticket" } : { label: "Inspect" };
    case "supply":
      return t.waiting_for_parts ? { label: "Parts received?" } : { label: "Sort parts" };
    case "repair":
      return { label: "Mark repaired" };
    case "test":
      return t.tests_left[0] ? { label: `Run ${TEST_LABELS[t.tests_left[0]].split(" ")[0]} check` } : { label: "Tests passed", emphasis: true };
    case "payment":
      return { label: "Payment received" };
    case "ship":
      return t.ship_ready ? { label: "Shipped", emphasis: true } : { label: "Generate label", emphasis: true };
    case "closed":
      return { label: "Summary" };
  }
}

export function progressLabel(t: BenchRow): string | null {
  if (t.stage === "test") return `${t.tests_passed} of 3`;
  return null;
}

export function rowTag(t: BenchRow, now: Date): BenchTicket["tag"] {
  if (t.waiting_for_parts) return { text: `Waiting on parts · asked ${formatDate(t.parts_requested_at, now)}`, tone: "amber" };
  if (t.parked) return { text: `Cannot replicate${t.slack_replies ? ` · Slack ${t.slack_replies} repl${t.slack_replies === 1 ? "y" : "ies"}` : ""}`, tone: "coral" };
  if (t.awaiting_payment) return { text: [t.payment_amount != null ? `$${t.payment_amount.toFixed(0)}` : null, t.invoice_sent_at ? `invoice sent ${formatDate(t.invoice_sent_at, now)}` : "invoice not sent"].filter(Boolean).join(" · "), tone: "gold" };
  if (t.priority && t.stage !== "closed") return { text: "Priority", tone: "coral" };
  return null;
}

export function decorate(rows: BenchRow[], grants: Grant[], now: Date): BenchTicket[] {
  return rows.map((t) => {
    const days = daysBetween(t.stage_entered_at, now);
    const own = canActOn(grants, t.stage, t.workspace_id, t.brand_id);
    const isParked = t.parked || t.waiting_for_parts;
    return {
      ...t,
      days,
      isParked,
      needsMe: own && !isParked && t.stage !== "closed",
      attention: t.stage !== "closed" && !isParked && days > ATTENTION_DAYS,
      next: nextAction(t),
      progress: progressLabel(t),
      tag: rowTag(t, now),
    };
  });
}

function matches(t: BenchTicket, filter: BenchFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_me":
      return t.needsMe;
    case "parked":
      return t.isParked;
    case "priority":
      return t.priority;
    case "payment":
      return t.stage === "payment" || (t.needs_payment && !t.payment_received && t.stage !== "closed");
  }
}

function matchesQuery(t: BenchTicket, q: string): boolean {
  if (!q) return true;
  const hay = `${t.customer_name} ${t.watch} ${t.number}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function buildBench(
  rows: BenchRow[],
  grants: Grant[],
  opts: { filter: BenchFilter; sort: BenchSort; query: string; now?: Date },
): Bench {
  const now = opts.now ?? new Date();
  const all = decorate(rows, grants, now);

  const parked = all.filter((t) => t.isParked);
  const over = all.filter((t) => t.attention);
  const payment = all.filter((t) => t.awaiting_payment);
  const needs = all.filter((t) => t.needsMe);
  const waitingN = parked.filter((t) => t.waiting_for_parts).length;
  const cannotN = parked.filter((t) => t.parked).length;

  const stats: BenchStats = {
    needsYou: { count: needs.length, note: needs.length === 1 ? "step waiting on your action" : "steps waiting on your action" },
    parked: {
      count: parked.length,
      note: parked.length ? [waitingN ? `${waitingN} waiting on parts` : null, cannotN ? `${cannotN} cannot replicate` : null].filter(Boolean).join(" · ") : "nothing parked",
    },
    over14: { count: over.length, note: over.length ? over.map((t) => firstName(t.customer_name)).join(" · ") : "everything is moving" },
    awaitingPayment: {
      count: payment.length,
      note: payment[0] ? `${firstName(payment[0].customer_name)} · ${payment[0].invoice_sent_at ? `invoice sent ${formatDate(payment[0].invoice_sent_at, now)}` : "invoice not sent"}` : "nothing owed",
    },
  };

  const counts = Object.fromEntries(BENCH_FILTERS.map((f) => [f.key, all.filter((t) => matches(t, f.key)).length])) as Record<BenchFilter, number>;

  const dir = opts.sort === "oldest" ? 1 : -1;
  const shown = all
    .filter((t) => matches(t, opts.filter) && matchesQuery(t, opts.query))
    .sort((a, b) => (b.days - a.days) * dir || a.number.localeCompare(b.number));

  const groups: BenchGroup[] = [];
  const parkedShown = shown.filter((t) => t.isParked);
  if (parkedShown.length) groups.push({ key: "parked", label: "Parked", count: parkedShown.length, tickets: parkedShown });
  const attention = shown.filter((t) => t.attention);
  if (attention.length) {
    groups.push({ key: "attention", label: "Needs attention", count: attention.length, note: `over ${ATTENTION_DAYS} days in step`, tickets: attention });
  }
  for (const stage of STAGES) {
    const tickets = shown.filter((t) => t.stage === stage && !t.attention && !t.isParked);
    if (tickets.length) groups.push({ key: stage, label: STAGE_LABELS[stage], count: tickets.length, tickets });
  }

  return { stats, counts, groups, total: all.length };
}

/** Closed list (D13): grouped by the month the ticket closed, newest first. */
export type ClosedFilter = "all" | "warranty" | "paid" | "nothing_wrong";
export const CLOSED_FILTERS: { key: ClosedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "warranty", label: "Warranty" },
  { key: "paid", label: "Paid" },
  { key: "nothing_wrong", label: "Nothing wrong" },
];

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });

/** "paid · crystal replaced" / "nothing wrong · returned": the one-line outcome on a closed row. */
export function closedOutcome(t: BenchRow): string {
  const work = t.outcome === "nothing wrong" ? "nothing wrong · returned" : t.outcome ? t.outcome.split(/[.;\n]/)[0].trim().replace(/^./, (c) => c.toLowerCase()) : null;
  return [t.needs_payment ? "paid" : null, work].filter(Boolean).join(" · ");
}

export type ClosedStats = { thisYear: number; avgDays: number | null };

/** "7 this year · avg 11 days bench to ship", from received to closed. */
export function closedStats(rows: BenchRow[], now: Date = new Date()): ClosedStats {
  const year = now.getFullYear();
  const thisYear = rows.filter((t) => t.closed_at && new Date(t.closed_at).getFullYear() === year).length;
  const spans = rows.filter((t) => t.closed_at && t.received_at).map((t) => (new Date(t.closed_at!).getTime() - new Date(t.received_at!).getTime()) / 86_400_000);
  const avgDays = spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : null;
  return { thisYear, avgDays };
}

export function closedMatches(t: BenchRow, filter: ClosedFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "warranty":
      return !t.needs_payment;
    case "paid":
      return t.needs_payment;
    case "nothing_wrong":
      return t.outcome === "nothing wrong";
  }
}

export function buildClosed(rows: BenchRow[], grants: Grant[], opts: { filter: ClosedFilter; query: string; now?: Date }): { groups: BenchGroup[]; counts: Record<ClosedFilter, number>; total: number; stats: ClosedStats } {
  const now = opts.now ?? new Date();
  const all = decorate(rows, grants, now);
  const counts = Object.fromEntries(CLOSED_FILTERS.map((f) => [f.key, all.filter((t) => closedMatches(t, f.key)).length])) as Record<ClosedFilter, number>;
  const shown = all.filter((t) => closedMatches(t, opts.filter) && matchesQuery(t, opts.query)).sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));
  const groups: BenchGroup[] = [];
  for (const t of shown) {
    const label = t.closed_at ? monthFmt.format(new Date(t.closed_at)) : "Undated";
    const g = groups.find((x) => x.key === label);
    if (g) {
      g.tickets.push(t);
      g.count++;
    } else groups.push({ key: label, label, count: 1, tickets: [t] });
  }
  return { groups, counts, total: all.length, stats: closedStats(rows, now) };
}
