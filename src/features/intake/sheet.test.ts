import { describe, expect, it } from "vitest";
import {
  buildRowForHeader,
  findRowByFingerprint,
  fingerprint,
  firstEmptyRow,
  matchModel,
  monthTabOrder,
  parseIncoming,
  parseIssue,
  parseSheetDate,
  rowToFields,
} from "./sheet";

const HEADER = ["Date", "Name", "Model", "Serial Number", "Issue", "Address Line 1", "Address Line 2", "City", "State", "Zip Code", "Country", "Email", "Payment Required?", "Return to Everett?"];
const MONTH_HEADER = ["Date Received", "Name", "Model", "Serial Number", "Issue", "Address Line 1", "Address Line 2", "City", "State", "Zip", "Country", "Email", "Solution", "Notes", "Payment Required?", "Payment Received?", "Repair Completed?", "Shipped Back?", "Return to Everett"];

const catalog = [
  { id: "sd", name: "Sector Deep", warranty_months: 24 },
  { id: "sgmt", name: "Sector GMT", warranty_months: 24 },
  { id: "av2", name: "Avalon II", warranty_months: 24 },
  { id: "ct", name: "Contrail GMT", warranty_months: 24 },
  { id: "cyn", name: "Canyon", warranty_months: 24 },
  { id: "tt", name: "TrailTrekker", warranty_months: 24 },
];

describe("parsing", () => {
  it("reads both date styles", () => {
    expect(parseSheetDate("7/15/2026")).toBe("2026-07-15");
    expect(parseSheetDate("2026-09-28")).toBe("2026-09-28");
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("soon")).toBeNull();
  });

  it("splits the claim token and payment line out of the issue", () => {
    const p = parseIssue("Dropped it.\nPAYMENT REQUIRED - $55\nPaid repair: movement repair\n→ Payment required after repair completion\n[Claim: 1a0db236438be75c]");
    expect(p.claimRef).toBe("1a0db236438be75c");
    expect(p.paymentAmount).toBe(55);
    expect(p.issue.endsWith("repair completion")).toBe(true);
    expect(parseIssue("Crown fell off")).toEqual({ issue: "Crown fell off", claimRef: null, paymentAmount: null });
  });

  it("maps month-tab headers to the same fields", () => {
    const f = rowToFields(MONTH_HEADER, ["10/3/2026", "Chris", "Sector Series", "508", "x", "1 St", "", "SLC", "UT", "84108", "US", "c@x.com", "sol", "", "FALSE", "FALSE", "TRUE", "FALSE", "FALSE"]);
    expect(f.date).toBe("10/3/2026");
    expect(f.zip).toBe("84108");
    expect(f.returnToEverett).toBe("FALSE");
  });
});

describe("fingerprint", () => {
  const a = rowToFields(HEADER, ["7/15/2026", "Thomas Dreiling", "Sector Deep", "", "Crown needs replacing", "", "", "", "", "", "", "", "FALSE"]);
  it("is stable across column order and date style", () => {
    const b = rowToFields(MONTH_HEADER, ["2026-07-15", "Thomas Dreiling", "Sector Deep", "", "Crown needs replacing", "", "", "", "", "", "", "", "", "", "FALSE", "FALSE", "FALSE", "FALSE", "FALSE"]);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
  it("changes when the words change, not the punctuation", () => {
    expect(fingerprint({ ...a, issue: "Crown needs replacing!" })).toBe(fingerprint(a));
    expect(fingerprint({ ...a, issue: "Crown and tube need replacing" })).not.toBe(fingerprint(a));
  });
});

describe("matchModel", () => {
  it("exact, fuzzy, none", () => {
    expect(matchModel("Sector Deep", catalog)).toMatchObject({ kind: "exact", watch: { id: "sd" } });
    expect(matchModel("Sector Deep AWWC", catalog)).toMatchObject({ kind: "fuzzy", watch: { id: "sd" } });
    expect(matchModel("Contrail GMT Bracelet", catalog)).toMatchObject({ kind: "fuzzy", watch: { id: "ct" } });
    expect(matchModel("Sector Series", catalog)).toEqual({ kind: "none" });
    expect(matchModel("NodeX", catalog)).toEqual({ kind: "none" });
    expect(matchModel("", catalog)).toEqual({ kind: "none" });
  });
});

describe("parseIncoming", () => {
  const values = [
    HEADER,
    ["6/10/2026", "Alex Riley", "TrailTrekker", "935", "Water got in. :(", "105 E Chalmers", "Apt.205", "Champaign", "IL", "61820", "US", "alexsebril@gmail.com", "FALSE"],
    ["9/22/2026", "Ben Corless", "Contrail II", "", "Replace sapphire inlay", "", "", "", "", "", "", "corpsless@gmail.com", "TRUE"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "FALSE"],
    ["7/13/2026", "David Mondero", "Sector Series", "5100030", "Stops and starts - RETURN TO EVERETT", "5495 Burr Oak Rd", "APT 210", "Lisle", "IL", "60532", "US", "d@pm.me", "FALSE", "TRUE"],
  ];
  const rows = parseIncoming(values, catalog);
  it("skips filler rows and keeps sheet row numbers", () => {
    expect(rows.map((r) => r.row)).toEqual([2, 3, 5]);
  });
  it("derives badges and flags", () => {
    expect(rows[0]).toMatchObject({ hasEmail: true, hasAddress: true, needsPayment: false, model: { kind: "exact" } });
    expect(rows[1]).toMatchObject({ hasEmail: true, hasAddress: false, needsPayment: true, model: { kind: "none" } });
    expect(rows[2]).toMatchObject({ returnToEverett: true, model: { kind: "none" } });
  });
  it("finds a row again by fingerprint", () => {
    expect(findRowByFingerprint(values, rows[1].fingerprint)).toBe(3);
    expect(findRowByFingerprint(values, "nope")).toBeNull();
  });
});

describe("month tab", () => {
  it("builds the destination row by header name", () => {
    const f = rowToFields(HEADER, ["6/10/2026", "Alex Riley", "TrailTrekker", "935", "Water", "105 E Chalmers", "", "Champaign", "IL", "61820", "US", "a@x.com", "TRUE", "FALSE"]);
    const row = buildRowForHeader(MONTH_HEADER, f);
    expect(row).toEqual(["6/10/2026", "Alex Riley", "TrailTrekker", "935", "Water", "105 E Chalmers", "", "Champaign", "IL", "61820", "US", "a@x.com", "", "", "TRUE", "", "", "", "FALSE"]);
  });
  it("writes above the FALSE filler", () => {
    expect(firstEmptyRow([MONTH_HEADER, ["10/3/2026", "Chris"], ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "FALSE"]])).toBe(3);
    expect(firstEmptyRow([MONTH_HEADER])).toBe(2);
  });
  it("orders month titles", () => {
    expect(monthTabOrder("Oct 2026")).toBeGreaterThan(monthTabOrder("Sep 2026"));
    expect(monthTabOrder("Sept 2022")).toBe(2022 * 12 + 8);
    expect(monthTabOrder("Summary")).toBe(-1);
  });
});
