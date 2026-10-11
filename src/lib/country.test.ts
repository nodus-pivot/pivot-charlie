import { describe, expect, it } from "vitest";
import { COUNTRIES, countryName, normalizeCountry, usStateName } from "./country";

describe("normalizeCountry", () => {
  it("maps what the sheet contains", () => {
    const cases: [string, string][] = [
      ["", "US"], ["US", "US"], ["USA", "US"], ["United States", "US"], ["U.S.", "US"],
      ["UK", "GB"], ["GB", "GB"], ["United Kingdom", "GB"], ["England", "GB"],
      ["France", "FR"], ["FRANCE", "FR"], ["PL", "PL"], ["AU", "AU"], ["Australia", "AU"], ["JAPAN", "JP"], ["JP", "JP"],
      ["CA", "CA"], ["FI", "FI"], ["NO", "NO"], ["TW", "TW"], ["Taiwan", "TW"], ["MALAYSIA", "MY"],
    ];
    for (const [raw, code] of cases) expect(normalizeCountry(raw), raw).toMatchObject({ code, recognised: true });
  });
  it("flags what it can't place", () => {
    expect(normalizeCountry("Narnia")).toEqual({ code: null, raw: "Narnia", recognised: false });
  });
});

describe("names", () => {
  it("renders codes and states", () => {
    expect(countryName("FR")).toBe("France");
    expect(countryName("GB")).toBe("United Kingdom");
    expect(usStateName("ca")).toBe("California");
    expect(usStateName("Loire-Atlantique")).toBe("Loire-Atlantique");
    expect(COUNTRIES[0].code).toBe("US");
    expect(COUNTRIES.length).toBeGreaterThan(200);
  });
});
