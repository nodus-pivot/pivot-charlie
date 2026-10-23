import { describe, expect, it } from "vitest";
import type { Grant } from "@/features/pipeline";
import { buildBench, buildClosed, nextAction, type BenchRow } from "./bench";

const WS = "ws";
const BRAND = "brand";
const rane: Grant[] = [{ role: "watchmaker", workspace_id: null, brand_id: BRAND }];
const rep: Grant[] = [{ role: "brand_rep", workspace_id: null, brand_id: BRAND }];
const now = new Date("2026-10-23T18:00:00Z");

function row(over: Partial<BenchRow> & { number: string; stage: BenchRow["stage"]; daysAgo: number }): BenchRow {
  const { daysAgo, ...rest } = over;
  return {
    id: over.number,
    workspace_id: WS,
    brand_id: BRAND,
    customer_name: "Someone Here",
    watch: "Sector Deep",
    priority: false,
    needs_payment: false,
    payment_amount: null,
    invoice_sent_at: null,
    payment_received: false,
    return_to_everett: false,
    coverage: "warranty",
    stage_entered_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    closed_at: null,
    parked: false,
    waiting_for_parts: false,
    parts_requested_at: null,
    parts_list: null,
    awaiting_payment: false,
    tests_passed: 0,
    ship_ready: false,
    outcome: null,
    slack_replies: null,
    bench_photo_path: null,
    tests_left: [],
    ...rest,
  };
}

const rows: BenchRow[] = [
  row({ number: "NW260011", stage: "check_in", daysAgo: 9, customer_name: "Michael Becker" }),
  row({ number: "NW260009", stage: "inspect", daysAgo: 1, customer_name: "Owen Brooks", parked: true, slack_replies: 1 }),
  row({ number: "NW260003", stage: "supply", daysAgo: 5, customer_name: "James Whitfield", waiting_for_parts: true, parts_requested_at: "2026-10-18T12:00:00Z" }),
  row({ number: "NW260016", stage: "repair", daysAgo: 8, customer_name: "Tyler McDonald" }),
  row({ number: "NW260002", stage: "test", daysAgo: 4, customer_name: "Maria Lopez", tests_passed: 3 }),
  row({ number: "NW260004", stage: "test", daysAgo: 3, customer_name: "Adam Ferguson", priority: true, tests_left: ["time", "water", "looks"] }),
  row({ number: "NW260005", stage: "payment", daysAgo: 12, customer_name: "Sarah Chen", needs_payment: true, payment_amount: 180, invoice_sent_at: "2026-10-11T12:00:00Z", awaiting_payment: true }),
  row({ number: "NW260006", stage: "ship", daysAgo: 1, customer_name: "Leo Park", ship_ready: true }),
  row({ number: "NW260001", stage: "check_in", daysAgo: 20, customer_name: "Old Timer" }),
];

describe("nextAction", () => {
  it("names the single thing to do next, like D0", () => {
    expect(rows.slice(0, 8).map((r) => nextAction(r).label)).toEqual([
      "I have the watch",
      "Open ticket",
      "Parts received?",
      "Mark repaired",
      "Tests passed",
      "Run Timekeeping check",
      "Payment received",
      "Shipped",
    ]);
  });
});

describe("buildBench", () => {
  const bench = buildBench(rows, rane, { filter: "all", sort: "oldest", query: "", now });

  it("counts the stat cards like the mock", () => {
    expect(bench.stats.needsYou.count).toBe(7); // nine tickets, two parked
    expect(bench.stats.parked).toEqual({ count: 2, note: "1 waiting on parts · 1 cannot replicate" });
    expect(bench.stats.over14).toEqual({ count: 1, note: "Old" });
    expect(bench.stats.awaitingPayment).toEqual({ count: 1, note: "Sarah · invoice sent Oct 11" });
  });

  it("pins Parked first, then attention, then the steps in order", () => {
    expect(bench.groups.map((g) => `${g.key}:${g.count}`)).toEqual(["parked:2", "attention:1", "check_in:1", "repair:1", "test:2", "payment:1", "ship:1"]);
    expect(bench.groups[0].tickets.map((t) => t.number)).toEqual(["NW260003", "NW260009"]);
  });

  it("tags parked and payment rows", () => {
    const by = Object.fromEntries(bench.groups.flatMap((g) => g.tickets).map((t) => [t.number, t.tag]));
    expect(by.NW260003).toEqual({ text: "Waiting on parts · asked Oct 18", tone: "amber" });
    expect(by.NW260009).toEqual({ text: "Cannot replicate · Slack 1 reply", tone: "coral" });
    expect(by.NW260005).toEqual({ text: "$180 · invoice sent Oct 11", tone: "gold" });
    expect(by.NW260006).toBeNull();
  });

  it("filter counts match the chips", () => {
    expect(bench.counts).toEqual({ all: 9, needs_me: 7, parked: 2, priority: 1, payment: 1, over_14: 1 });
  });

  it("filters, searches and sorts", () => {
    const p = buildBench(rows, rane, { filter: "priority", sort: "oldest", query: "", now });
    expect(p.groups.flatMap((g) => g.tickets.map((t) => t.number))).toEqual(["NW260004"]);
    const s = buildBench(rows, rane, { filter: "all", sort: "oldest", query: "leo", now });
    expect(s.groups.map((g) => g.key)).toEqual(["ship"]);
  });

  it("a brand rep only 'needs' the check-in step", () => {
    const r = buildBench(rows, rep, { filter: "all", sort: "oldest", query: "", now });
    expect(r.stats.needsYou.count).toBe(2);
  });
});

describe("buildClosed", () => {
  const closed: BenchRow[] = [
    row({ number: "NW260007", stage: "closed", daysAgo: 47, customer_name: "Tom Reyes", closed_at: "2026-09-06T12:00:00Z", outcome: "Clasp replaced." }),
    row({ number: "NW260008", stage: "closed", daysAgo: 44, customer_name: "Priya Nair", closed_at: "2026-09-09T12:00:00Z", needs_payment: true, payment_received: true, outcome: "Crystal replaced." }),
    row({ number: "NW260019", stage: "closed", daysAgo: 41, customer_name: "Lena Park", closed_at: "2026-09-12T12:00:00Z", outcome: "nothing wrong" }),
    row({ number: "NW260014", stage: "closed", daysAgo: 54, customer_name: "Marcus Hill", closed_at: "2026-08-30T12:00:00Z", outcome: "Demagnetised." }),
  ];
  it("groups by month, newest first, with the D13 filters", () => {
    const c = buildClosed(closed, rane, { filter: "all", query: "", now });
    expect(c.groups.map((g) => `${g.label}:${g.count}`)).toEqual(["September 2026:3", "August 2026:1"]);
    expect(c.groups[0].tickets.map((t) => t.number)).toEqual(["NW260019", "NW260008", "NW260007"]);
    expect(c.counts).toEqual({ all: 4, warranty: 3, paid: 1, nothing_wrong: 1 });
  });
});
