import { COMPONENT_LABELS, STAGES, STAGE_LABELS, stageIndex, type Component, type Stage } from "@/features/pipeline";
import { formatDate, formatMinutes } from "@/lib/format";

/**
 * The step rail's one-line summaries for completed steps ("Aug 17 · Bezel ·
 * Case · Gaskets"), computed from the ticket's own tables. Pure; the page
 * passes plain data in.
 */

export type StepState = "done" | "current" | "future";

export type StepRow = { stage: Stage; label: string; state: StepState; date: string | null; summary: string | null };

export type SummaryInput = {
  stage: Stage;
  bench_minutes: number | null;
  closed_at: string | null;
  received_at: string | null;
  events: { type: string; from_stage: Stage | null; to_stage: Stage | null; created_at: string; actor_name: string | null }[];
  findings: { component: Component; action: "fix" | "replace"; condition: string | null; part: { name: string; sku: string } | null; done_at: string | null }[];
  parts: { have_it: boolean; arrived_at: string | null; requested_at: string | null; label: string | null; part: { name: string; component?: string } }[];
  tests: { attempt: number; kind: string; result: string }[];
  test_attempt: number;
  shipment: { carrier: string | null; tracking: string | null; handed_over: boolean; shipped_at: string | null } | null;
};

/** When the ticket left a stage: the latest forward move out of it. */
export function completedAt(events: SummaryInput["events"], stage: Stage): string | null {
  const e = events.filter((x) => x.type === "stage_changed" && x.from_stage === stage).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return e?.created_at ?? null;
}

/** When the ticket entered a stage: the latest move into it (or creation for check_in). */
export function enteredAt(events: SummaryInput["events"], stage: Stage): string | null {
  const e = events
    .filter((x) => x.to_stage === stage && ["stage_changed", "sent_back", "reopened", "created"].includes(x.type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return e?.created_at ?? null;
}

function labels(components: Component[]): string {
  return components.map((c) => COMPONENT_LABELS[c]).join(" · ");
}

export function stepSummary(t: SummaryInput, stage: Stage, now: Date): string | null {
  switch (stage) {
    case "check_in": {
      const e = t.events.find((x) => x.type === "stage_changed" && x.from_stage === "check_in");
      return e?.actor_name ?? null;
    }
    case "inspect":
      return t.findings.length ? labels(t.findings.map((f) => f.component)) : "nothing to fix";
    case "supply": {
      if (!t.parts.length) return "no parts needed";
      const arrived = t.parts.map((p) => p.arrived_at).filter((x): x is string => !!x).sort().at(-1);
      return `${t.parts.length} part${t.parts.length === 1 ? "" : "s"} · ${arrived ? `in hand ${formatDate(arrived, now)}` : "all in hand"}`;
    }
    case "fix": {
      const done = labels(t.findings.filter((f) => f.done_at).map((f) => f.component));
      return [done || null, t.bench_minutes ? formatMinutes(t.bench_minutes) : null].filter(Boolean).join(" · ") || null;
    }
    case "test": {
      const passed = t.tests.filter((x) => x.attempt === t.test_attempt && x.result === "pass").map((x) => x.kind);
      const order = ["time", "water", "looks"];
      const names = order.filter((k) => passed.includes(k)).map((k) => k[0].toUpperCase() + k.slice(1));
      return names.length ? `${names.join(" · ")}${names.length === 3 ? " · all passed" : ""}` : null;
    }
    case "ship": {
      if (!t.shipment) return null;
      if (t.shipment.handed_over) return "handed over in person";
      return [t.shipment.carrier?.toUpperCase(), t.shipment.tracking].filter(Boolean).join(" ") || null;
    }
    case "closed":
      return null;
  }
}

export function stepRows(t: SummaryInput, now: Date = new Date()): StepRow[] {
  const current = stageIndex(t.stage);
  return STAGES.filter((s) => s !== "closed").map((stage) => {
    const ix = stageIndex(stage);
    const state: StepState = t.stage === "closed" || ix < current ? "done" : ix === current ? "current" : "future";
    const when = state === "done" ? completedAt(t.events, stage) : enteredAt(t.events, stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      state,
      date: when ? formatDate(when, now) : null,
      summary: state === "done" ? stepSummary(t, stage, now) : null,
    };
  });
}

/** The band's trailing line: "Contrail GMT · NW260004 · in Check in · priority". */
export function statusWord(t: { stage: Stage; closed_at: string | null; parked: boolean }, now: Date = new Date()): { text: string; tone: "gold" | "amber" | "green" } {
  if (t.stage === "closed") return { text: `closed ${formatDate(t.closed_at, now)}`, tone: "green" };
  if (t.parked) return { text: "waiting for parts", tone: "amber" };
  return { text: `in ${STAGE_LABELS[t.stage]}`, tone: "gold" };
}

/** S10: the repair as a record, one dated line per step. */
export type ClosedRow = { label: string; text: string };

const CONDITION_LABEL: Record<string, string> = { worn: "Worn", scratched: "Scratched", discolored: "Discolored", cracked: "Cracked" };
const EMAIL_LABEL: Record<string, string> = { request_received: "Request received", repair_in_progress: "Repair in progress", testing: "Testing", on_its_way: "On its way back" };

export function closedRows(
  t: SummaryInput & { source: "sheet" | "by_hand"; coverage: "warranty" | "paid" | null; emails: string[] },
  now: Date = new Date(),
): ClosedRow[] {
  const d = (iso: string | null) => (iso ? formatDate(iso, now) : null);
  const checkIn = t.events.find((e) => e.type === "stage_changed" && e.from_stage === "check_in");
  const rows: ClosedRow[] = [];

  rows.push({
    label: "Checked in",
    text: [d(checkIn?.created_at ?? null), checkIn?.actor_name, t.source === "sheet" ? "from the website" : "by hand"].filter(Boolean).join(" · "),
  });

  rows.push({
    label: "Inspected",
    text: [
      d(completedAt(t.events, "inspect")),
      ...t.findings.map((f) => [COMPONENT_LABELS[f.component], f.condition ? CONDITION_LABEL[f.condition] : null, f.action === "replace" ? "Replace" : "Fix"].filter(Boolean).join(" · ")),
    ].filter(Boolean).join(" · ") || "nothing to fix",
  });

  const supplyBits = t.parts.map((p) => {
    const name = p.label ? p.label.toLowerCase() : p.part.component && p.part.component in COMPONENT_LABELS ? COMPONENT_LABELS[p.part.component as Component].toLowerCase() : p.part.name.toLowerCase();
    if (p.have_it) return `had the ${name} in hand`;
    if (p.requested_at) return `${name} requested ${d(p.requested_at)}${p.arrived_at ? `, arrived ${d(p.arrived_at)}` : ""}`;
    return `${name} in hand`;
  });
  rows.push({ label: "Supply", text: [d(completedAt(t.events, "supply")), ...(supplyBits.length ? supplyBits : ["no parts needed"])].filter(Boolean).join(" · ") });

  const fixBits = t.findings.map((f) =>
    f.action === "replace" ? `Replace — ${f.part ? `${f.part.name} ${f.part.sku}` : COMPONENT_LABELS[f.component]}` : `${COMPONENT_LABELS[f.component]} fixed`,
  );
  rows.push({
    label: "Fixed",
    text: [d(completedAt(t.events, "fix")), ...fixBits, t.bench_minutes ? formatMinutes(t.bench_minutes) : null, t.coverage].filter(Boolean).join(" · "),
  });

  const attempts = Math.max(1, ...t.tests.map((x) => x.attempt));
  rows.push({
    label: "Tested",
    text: [d(completedAt(t.events, "test")), "Time · Water · Looks all passed", attempts > 1 ? `on attempt ${attempts}` : null].filter(Boolean).join(" · "),
  });

  rows.push({
    label: "Shipped",
    text: t.shipment
      ? [
          d(t.shipment.shipped_at ?? completedAt(t.events, "ship")),
          t.shipment.handed_over ? "handed over in person" : [t.shipment.carrier?.toUpperCase(), t.shipment.tracking].filter(Boolean).join(" "),
          t.shipment.handed_over ? null : (t.shipment as { signature_required?: boolean }).signature_required ? "signature required" : "signature not required",
        ].filter(Boolean).join(" · ")
      : "—",
  });

  const sent = t.emails.map((k) => EMAIL_LABEL[k] ?? k);
  rows.push({ label: "Emails", text: sent.length ? sent.join(" · ") : "none logged" });
  return rows;
}
