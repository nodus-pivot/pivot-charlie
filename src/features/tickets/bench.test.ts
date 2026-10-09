import { describe, expect, it } from "vitest";
import type { Grant } from "@/features/pipeline";
import { buildBench, nextAction, waitingWord, type BenchRow } from "./bench";

const WS = "ws";
const BRAND = "brand";
const rane: Grant[] = [{ role: "watchmaker", workspace_id: null, brand_id: BRAND }];
const rep: Grant[] = [{ role: "brand_rep", workspace_id: null, brand_id: BRAND }];
const now = new Date("2026-10-09T18:00:00Z");

function row(over: Partial<BenchRow> & { number: string; stage: BenchRow["stage"]; daysAgo: number }): BenchRow {
  const { daysAgo, ...rest } = over;
  return {
    id: over.number,
    workspace_id: WS,
    brand_id: BRAND,
    customer_name: "Someone Here",
    watch_name: "Sector Deep",
    priority: false,
    needs_payment: false,
    payment_received: false,
    return_to_everett: false,
    stage_entered_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    closed_at: null,
    parked: false,
    waiting_on: null,
    parts_requested_at: null,
    findings_total: 0,
    findings_done: 0,
    parts_total: 0,
    parts_in_hand: 0,
    tests_passed: 0,
    ship_ready: false,
    bench_photo_path: null,
    undone: [],
    tests_left: [],
    ...rest,
  };
}

const rows: BenchRow[] = [
  row({ number: "NW260001", stage: "check_in", daysAgo: 30, customer_name: "Dana Whitmore" }),
  row({ number: "NW260002", stage: "inspect", daysAgo: 24, customer_name: "Maria Lopez" }),
  row({ number: "NW260003", stage: "supply", daysAgo: 22, customer_name: "James Whitfield", parked: true, waiting_on: "Dial, Sector GMT", parts_requested_at: "2026-10-02T12:00:00Z", parts_total: 2, parts_in_hand: 1 }),
  row({ number: "NW260004", stage: "fix", daysAgo: 12, customer_name: "Adam Ferguson", priority: true, findings_total: 3, findings_done: 1, undone: ["case", "gaskets"] }),
  row({ number: "NW260005", stage: "test", daysAgo: 6, customer_name: "Sarah Chen", tests_passed: 2, tests_left: ["looks"] }),
  row({ number: "NW260006", stage: "ship", daysAgo: 1, customer_name: "Leo Park" }),
];

describe("nextAction", () => {
  it("names the thing to do next", () => {
    expect(rows.map((r) => nextAction(r).label)).toEqual([
      "Confirm check in",
      "Finish inspection",
      "Mark dial arrived",
      "Mark Case done",
      "Run Looks check",
      "Print label",
    ]);
  });
  it("takes the part word before the comma", () => {
    expect(waitingWord("Dial, Sector GMT")).toBe("dial");
    expect(waitingWord("Spare casetube")).toBe("spare casetube");
    expect(waitingWord(null)).toBe("part");
  });
});

describe("buildBench", () => {
  const bench = buildBench(rows, rane, { filter: "all", sort: "oldest", query: "", now });

  it("counts the stat cards like the mock", () => {
    expect(bench.stats.needsYou.count).toBe(5); // six tickets, one parked
    expect(bench.stats.waiting).toEqual({ count: 1, note: "James · dial requested Oct 2" });
    expect(bench.stats.over14).toEqual({ count: 3, note: "Dana · Maria · James" });
    expect(bench.stats.readyToShip).toEqual({ count: 1, note: "Leo Park · label not printed" });
  });

  it("pins Needs attention first, then stage groups in order", () => {
    expect(bench.groups.map((g) => `${g.key}:${g.count}`)).toEqual(["attention:3", "fix:1", "test:1", "ship:1"]);
    expect(bench.groups[0].tickets.map((t) => t.number)).toEqual(["NW260001", "NW260002", "NW260003"]);
  });

  it("filter counts match the chips", () => {
    expect(bench.counts).toEqual({ all: 6, needs_me: 5, waiting: 1, priority: 1, over_14: 3 });
  });

  it("filters, searches and sorts", () => {
    const p = buildBench(rows, rane, { filter: "priority", sort: "oldest", query: "", now });
    expect(p.groups.flatMap((g) => g.tickets.map((t) => t.number))).toEqual(["NW260004"]);
    const q = buildBench(rows, rane, { filter: "all", sort: "newest", query: "sector deep", now });
    // Needs attention stays pinned first; newest-first applies inside each group.
    expect(q.groups[0].tickets.map((t) => t.number)).toEqual(["NW260003", "NW260002", "NW260001"]);
    const s = buildBench(rows, rane, { filter: "all", sort: "oldest", query: "leo", now });
    expect(s.groups.map((g) => g.key)).toEqual(["ship"]);
  });

  it("a brand rep only 'needs' the check-in step", () => {
    const r = buildBench(rows, rep, { filter: "all", sort: "oldest", query: "", now });
    expect(r.stats.needsYou.count).toBe(1);
  });
});
