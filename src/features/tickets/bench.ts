import { STAGES, STAGE_LABELS, canActOn, type Grant, type Stage } from "@/features/pipeline";
import { daysBetween, formatDate } from "@/lib/format";

/**
 * My bench (S1), the pure part: takes board rows plus the per-ticket detail
 * the next-action labels need, and returns stats, filter counts and groups.
 * No React, no Supabase.
 */

export type BenchRow = {
  id: string;
  number: string;
  stage: Stage;
  workspace_id: string;
  brand_id: string;
  customer_name: string;
  watch_name: string;
  priority: boolean;
  needs_payment: boolean;
  payment_received: boolean;
  return_to_everett: boolean;
  stage_entered_at: string;
  closed_at: string | null;
  parked: boolean;
  waiting_on: string | null;
  parts_requested_at: string | null;
  findings_total: number;
  findings_done: number;
  parts_total: number;
  parts_in_hand: number;
  tests_passed: number;
  ship_ready: boolean;
  bench_photo_path: string | null;
  /** Components not yet marked done, in chip order. Empty outside Fix. */
  undone: string[];
  /** Test kinds without a pass in the current attempt. Empty outside Test. */
  tests_left: string[];
};

export const ATTENTION_DAYS = 14;
export const AGE_BAR_MAX_DAYS = 30;

export type BenchFilter = "all" | "needs_me" | "waiting" | "priority" | "over_14";
export const BENCH_FILTERS: { key: BenchFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_me", label: "Needs me" },
  { key: "waiting", label: "Waiting on parts" },
  { key: "priority", label: "Priority" },
  { key: "over_14", label: "Over 14 days" },
];

export type BenchSort = "oldest" | "newest";

export type NextAction = { label: string; emphasis?: boolean };

export type BenchTicket = BenchRow & {
  days: number;
  needsMe: boolean;
  attention: boolean;
  next: NextAction;
  /** "1 of 3", "2 of 3" — the progress fragment after the ticket number. */
  progress: string | null;
};

export type BenchGroup = { key: string; label: string; count: number; note?: string; tickets: BenchTicket[] };

export type BenchStats = {
  needsYou: { count: number; note: string };
  waiting: { count: number; note: string };
  over14: { count: number; note: string };
  readyToShip: { count: number; note: string };
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The part word for "Mark dial arrived": the catalog name before its comma, lowercased. */
export function waitingWord(waitingOn: string | null): string {
  if (!waitingOn) return "part";
  return waitingOn.split(",")[0].trim().toLowerCase();
}

export function nextAction(t: BenchRow): NextAction {
  switch (t.stage) {
    case "check_in":
      return { label: "Confirm check in" };
    case "inspect":
      return { label: "Finish inspection" };
    case "supply":
      if (t.parked) return { label: `Mark ${waitingWord(t.waiting_on)} arrived` };
      return { label: t.parts_total === 0 ? "Continue to Fix" : "Sort parts" };
    case "fix":
      return { label: t.undone[0] ? `Mark ${cap(t.undone[0])} done` : "Fix done" };
    case "test":
      return { label: t.tests_left[0] ? `Run ${cap(t.tests_left[0])} check` : "Tests passed" };
    case "ship":
      return t.ship_ready ? { label: "Close ticket", emphasis: true } : { label: "Print label", emphasis: true };
    case "closed":
      return { label: "Open" };
  }
}

export function progressLabel(t: BenchRow): string | null {
  if (t.stage === "fix" && t.findings_total > 0) return `${t.findings_done} of ${t.findings_total}`;
  if (t.stage === "test") return `${t.tests_passed} of 3`;
  return null;
}

export function decorate(rows: BenchRow[], grants: Grant[], now: Date): BenchTicket[] {
  return rows.map((t) => {
    const days = daysBetween(t.stage_entered_at, now);
    const own = canActOn(grants, t.stage, t.workspace_id, t.brand_id);
    return {
      ...t,
      days,
      needsMe: own && !t.parked && t.stage !== "closed",
      attention: t.stage !== "closed" && days > ATTENTION_DAYS,
      next: nextAction(t),
      progress: progressLabel(t),
    };
  });
}

function matches(t: BenchTicket, filter: BenchFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_me":
      return t.needsMe;
    case "waiting":
      return t.parked;
    case "priority":
      return t.priority;
    case "over_14":
      return t.attention;
  }
}

function matchesQuery(t: BenchTicket, q: string): boolean {
  if (!q) return true;
  const hay = `${t.customer_name} ${t.watch_name} ${t.number}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

export function buildBench(
  rows: BenchRow[],
  grants: Grant[],
  opts: { filter: BenchFilter; sort: BenchSort; query: string; now?: Date },
): Bench {
  const now = opts.now ?? new Date();
  const all = decorate(rows, grants, now);

  const waiting = all.filter((t) => t.parked);
  const over = all.filter((t) => t.attention);
  const ready = all.filter((t) => t.stage === "ship");
  const needs = all.filter((t) => t.needsMe);

  const stats: BenchStats = {
    needsYou: { count: needs.length, note: needs.length === 1 ? "step waiting on your action" : "steps waiting on your action" },
    waiting: {
      count: waiting.length,
      note: waiting[0]
        ? `${firstName(waiting[0].customer_name)} · ${waitingWord(waiting[0].waiting_on)} requested ${formatDate(waiting[0].parts_requested_at, now)}`
        : "nothing parked",
    },
    over14: { count: over.length, note: over.length ? over.map((t) => firstName(t.customer_name)).join(" · ") : "everything is moving" },
    readyToShip: {
      count: ready.length,
      note: ready[0] ? `${ready[0].customer_name} · ${ready[0].ship_ready ? "ready to close" : "label not printed"}` : "nothing at Ship",
    },
  };

  const counts = Object.fromEntries(BENCH_FILTERS.map((f) => [f.key, all.filter((t) => matches(t, f.key)).length])) as Record<BenchFilter, number>;

  const dir = opts.sort === "oldest" ? 1 : -1;
  const shown = all
    .filter((t) => matches(t, opts.filter) && matchesQuery(t, opts.query))
    .sort((a, b) => (b.days - a.days) * dir || a.number.localeCompare(b.number));

  const groups: BenchGroup[] = [];
  const attention = shown.filter((t) => t.attention);
  if (attention.length) {
    groups.push({ key: "attention", label: "Needs attention", count: attention.length, note: `over ${ATTENTION_DAYS} days in step`, tickets: attention });
  }
  for (const stage of STAGES) {
    const tickets = shown.filter((t) => t.stage === stage && !t.attention);
    if (tickets.length) groups.push({ key: stage, label: STAGE_LABELS[stage], count: tickets.length, tickets });
  }

  return { stats, counts, groups, total: all.length };
}
