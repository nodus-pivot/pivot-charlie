import { STAGE_LABELS, STEPS, TEST_LABELS, stageIndex, type Stage, type Step, type TestKind } from "@/features/pipeline";
import { formatDate } from "@/lib/format";

/**
 * The step rail's one-line summaries for completed steps ("Oct 16 · Issue
 * present · Crown tube stripped…"), computed from the ticket's step rows.
 * Pure; the page passes plain data in.
 */

export type StepState = "done" | "current" | "future";

export type StepRecord = {
  stage: Step;
  answer: boolean | null;
  notes: string | null;
  done_at: string | null;
  done_by_name: string | null;
  skipped: boolean;
  updated_at: string;
};

export type StepRow = { stage: Step; label: string; state: StepState; date: string | null; summary: string | null; skipped: boolean };

export type SummaryInput = {
  stage: Stage;
  needs_payment: boolean;
  payment_amount: number | null;
  closed_at: string | null;
  ship_carrier: string | null;
  ship_tracking: string | null;
  steps: StepRecord[];
  tests: { attempt: number; kind: string; result: string }[];
  test_attempt: number;
  messages: { channel: "slack" | "email"; kind: string; created_at: string; reply_count: number; status?: "logged" | "sent" | "failed" }[];
};

export function stepOf(t: { steps: StepRecord[] }, stage: Step): StepRecord | undefined {
  return t.steps.find((s) => s.stage === stage);
}

function firstLine(text: string | null | undefined, max = 60): string | null {
  const line = text?.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** "1× Dial, 1× Crown" → "dial, crown": the parts list as a short phrase. */
export function partsPhrase(list: string | null | undefined): string | null {
  const items = (list ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*\d+\s*[x×]\s*/i, "").split(",")[0].trim().toLowerCase())
    .filter(Boolean);
  return items.length ? items.join(", ") : null;
}

export function stepSummary(t: SummaryInput, stage: Step): string | null {
  const s = stepOf(t, stage);
  if (!s) return null;
  if (s.skipped) return stage === "payment" ? "Not required · warranty" : "skipped · nothing wrong";
  switch (stage) {
    case "check_in":
      return [s.done_by_name, emailWord(t, "received")].filter(Boolean).join(" · ") || null;
    case "inspect":
      return [s.answer === false ? "Nothing wrong" : s.answer ? "Issue present" : null, firstLine(s.notes)].filter(Boolean).join(" · ") || null;
    case "supply":
      return s.answer ? "had parts" : s.answer === false ? ["Parts received", partsPhrase(s.notes)].filter(Boolean).join(" · ") : null;
    case "repair":
      return firstLine(s.notes) ?? "Repaired";
    case "test": {
      const attempts = Math.max(1, ...t.tests.map((x) => x.attempt));
      return [attempts > 1 ? `all pass · attempt ${attempts}` : "all pass", emailWord(t, "tested")].filter(Boolean).join(" · ");
    }
    case "payment":
      return [t.payment_amount != null ? `$${t.payment_amount.toFixed(0)} · paid` : "paid", emailWord(t, "invoice")].filter(Boolean).join(" · ");
    case "ship":
      return [[t.ship_carrier, t.ship_tracking].filter(Boolean).join(" ") || "shipped", emailWord(t, "shipped")].filter(Boolean).join(" · ");
  }
}

/** "email sent" · "email failed" · "email logged" (sending off) · null when none was recorded. Newest row of the kind wins. */
export function emailWord(t: Pick<SummaryInput, "messages">, kind: string): string | null {
  const m = [...t.messages].reverse().find((x) => x.channel === "email" && x.kind === kind);
  if (!m) return null;
  return m.status === "failed" ? "email failed" : m.status === "logged" ? "email logged" : "email sent";
}

export function stepRows(t: SummaryInput, now: Date = new Date()): StepRow[] {
  const current = stageIndex(t.stage);
  return STEPS.map((stage) => {
    const s = stepOf(t, stage);
    const ix = stageIndex(stage);
    // The open step stays open even once its row is done (Supply's "Parts received" ticks done_at before advancing).
    const state: StepState = t.stage === "closed" || ix < current ? "done" : ix === current ? "current" : "future";
    return {
      stage,
      label: STAGE_LABELS[stage],
      state,
      date: state === "done" && s?.done_at && !s.skipped ? formatDate(s.done_at, now) : null,
      summary: state === "done" ? stepSummary(t, stage) : null,
      skipped: !!s?.skipped,
    };
  });
}

export type Parked = { kind: "cannot_replicate" | "waiting_for_parts"; since: string | null; replies: number };

/** Parked state from the step rows: cannot replicate on Inspect, waiting on parts on Supply. */
export function parkedState(t: SummaryInput): Parked | null {
  if (t.stage === "inspect" && stepOf(t, "inspect")?.answer === false) {
    const post = [...t.messages].reverse().find((m) => m.channel === "slack" && m.kind === "cannot_replicate");
    return { kind: "cannot_replicate", since: post?.created_at ?? null, replies: post?.reply_count ?? 0 };
  }
  if (t.stage === "supply") {
    const s = stepOf(t, "supply");
    const post = [...t.messages].reverse().find((m) => m.channel === "slack" && m.kind === "parts_needed");
    if (s?.answer === false && !s.done_at && post) return { kind: "waiting_for_parts", since: post.created_at, replies: post.reply_count };
  }
  return null;
}

/** The band's trailing line: "Sector GMT · NW260003 · in Supply · waiting for parts". */
export function statusWord(t: { stage: Stage; closed_at: string | null; parked: Parked | null; awaiting_payment: boolean }, now: Date = new Date()): { text: string; tone: "gold" | "amber" | "green" | "coral" } {
  if (t.stage === "closed") return { text: `closed · ${formatDate(t.closed_at, now)}`, tone: "green" };
  if (t.parked?.kind === "cannot_replicate") return { text: "parked · cannot replicate", tone: "coral" };
  if (t.parked?.kind === "waiting_for_parts") return { text: "waiting for parts", tone: "amber" };
  if (t.awaiting_payment) return { text: "awaiting payment", tone: "amber" };
  return { text: `in ${STAGE_LABELS[t.stage]}`, tone: "gold" };
}

/** D10: the repair as a record, one line per step. */
export type ClosedRow = { label: string; text: string };

export function closedRows(
  t: SummaryInput & { issue: string | null; source: "sheet" | "by_hand"; coverage: "warranty" | "paid" | null; check_in_by: string | null },
  now: Date = new Date(),
): ClosedRow[] {
  const d = (iso: string | null | undefined) => (iso ? formatDate(iso, now) : null);
  const s = (stage: Step) => stepOf(t, stage);
  const rows: ClosedRow[] = [];

  rows.push({ label: "Reported", text: [t.issue, t.source === "sheet" ? "from the website" : "by hand", t.check_in_by ? `checked in ${d(s("check_in")?.done_at)} by ${t.check_in_by}` : null].filter(Boolean).join(" · ") });
  const ins = s("inspect");
  rows.push({ label: "Found", text: [ins?.answer === false ? "Could not replicate the issue" : ins?.answer ? "Issue present" : null, ins?.notes].filter(Boolean).join(" · ") || "—" });
  const sup = s("supply");
  rows.push({ label: "Parts", text: sup?.skipped ? "None · nothing wrong" : sup?.answer ? "Had on bench" : sup?.answer === false ? [partsPhrase(sup.notes) ?? "parts requested", sup.done_at ? `received ${d(sup.done_at)}` : null].filter(Boolean).join(" · ") : "—" });
  const rep = s("repair");
  rows.push({ label: "Repaired", text: rep?.skipped ? "Nothing to repair" : [rep?.notes, d(rep?.done_at)].filter(Boolean).join(" · ") || "—" });
  const attempts = Math.max(1, ...t.tests.map((x) => x.attempt));
  const tst = s("test");
  rows.push({ label: "Tested", text: tst?.skipped ? "Skipped · nothing wrong" : [`${Object.values(TEST_LABELS).map((l, i) => (i ? l.toLowerCase() : l)).join(", ")} · all pass`, attempts > 1 ? `on attempt ${attempts}` : null].filter(Boolean).join(" · ") });
  const pay = s("payment");
  rows.push({ label: "Payment", text: pay?.skipped || !t.needs_payment ? "Not required · warranty" : [t.payment_amount != null ? `$${t.payment_amount.toFixed(2)}` : null, pay?.answer ? `paid ${d(pay.done_at) ?? ""}`.trim() : "not paid · shipped on an owner override"].filter(Boolean).join(" · ") });
  const shipped = s("ship");
  const emailed = t.messages.some((m) => m.channel === "email" && m.kind === "shipped");
  rows.push({ label: "Shipped", text: [d(shipped?.done_at), [t.ship_carrier, t.ship_tracking].filter(Boolean).join(" ") || null, emailed ? "customer emailed" : null].filter(Boolean).join(" · ") || "—" });
  return rows;
}

/** Test kinds without a pass in the current attempt, in order. */
export function testsLeft(tests: { attempt: number; kind: string; result: string }[], attempt: number): TestKind[] {
  const passed = new Set(tests.filter((x) => x.attempt === attempt && x.result === "pass").map((x) => x.kind));
  return (["time", "water", "looks"] as TestKind[]).filter((k) => !passed.has(k));
}
