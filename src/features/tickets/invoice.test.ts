import { describe, expect, it } from "vitest";
import { invoiceMemo } from "./invoice";

describe("invoiceMemo", () => {
  it("trims and keeps line breaks", () => {
    expect(invoiceMemo("  Replaced the crystal.\r\nCleaned the bezel.  ")).toBe("Replaced the crystal.\nCleaned the bezel.");
  });
  it("is null when nothing was written", () => {
    expect(invoiceMemo(null)).toBeNull();
    expect(invoiceMemo("  \n ")).toBeNull();
  });
  it("stays within Stripe's 500-character limit", () => {
    const memo = invoiceMemo("x".repeat(900))!;
    expect(memo.length).toBeLessThanOrEqual(500);
    expect(memo.endsWith("…")).toBe(true);
  });
});
