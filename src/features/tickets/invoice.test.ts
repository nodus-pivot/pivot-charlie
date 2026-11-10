import { describe, expect, it } from "vitest";
import { invoiceDescription } from "./invoice";

const ticket = { watch: "Sector Deep", issue: "Crown won't screw down" };

describe("invoiceDescription", () => {
  it("lists the watch, ticket, and each step's notes on its own line", () => {
    const text = invoiceDescription("NW260004", ticket, [
      { stage: "inspect", notes: "Crown tube stripped\ngasket worn" },
      { stage: "supply", notes: "1× Crown tube\n1× Crown gasket\n" },
      { stage: "repair", notes: "Replaced crown tube, pressure tested" },
    ]);
    expect(text).toBe(
      ["Sector Deep · Ticket NW260004", "Reported: Crown won't screw down", "Found: Crown tube stripped, gasket worn", "Parts: 1× Crown tube, 1× Crown gasket", "Work: Replaced crown tube, pressure tested"].join("\n"),
    );
  });

  it("drops empty sections", () => {
    expect(invoiceDescription("NW1", { watch: "Sector GMT", issue: null }, [{ stage: "inspect", notes: "  " }])).toBe("Sector GMT · Ticket NW1");
  });

  it("stays within Stripe's 500-character limit", () => {
    const text = invoiceDescription("NW1", ticket, [{ stage: "repair", notes: "x".repeat(900) }]);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text.endsWith("…")).toBe(true);
  });
});
