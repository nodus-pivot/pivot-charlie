/**
 * Countries are stored as ISO 3166-1 alpha-2 codes and shown as names.
 * The normaliser turns whatever the website form or a person typed into a
 * code; what it can't recognise is kept as typed and flagged for a human.
 */

const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

const names = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** All countries as {code, name}, United States first, then alphabetical. */
export const COUNTRIES: { code: string; name: string }[] = (() => {
  const list = CODES.map((code) => ({ code, name: countryName(code) })).filter((c) => c.name && c.name !== c.code);
  list.sort((a, b) => a.name.localeCompare(b.name));
  return [list.find((c) => c.code === "US")!, ...list.filter((c) => c.code !== "US")];
})();

/** What the sheet and people actually write. Lowercased, punctuation stripped. */
const ALIASES: Record<string, string> = {
  us: "US", usa: "US", "u s": "US", "u s a": "US", "united states": "US", "united states of america": "US", america: "US", "estados unidos": "US",
  uk: "GB", gb: "GB", "united kingdom": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  "south korea": "KR", korea: "KR", "republic of korea": "KR",
  "czech republic": "CZ", czechia: "CZ",
  russia: "RU", vietnam: "VN", taiwan: "TW", "hong kong": "HK", macau: "MO", uae: "AE", "the netherlands": "NL", holland: "NL",
  deutschland: "DE", germany: "DE", españa: "ES", mexico: "MX", méxico: "MX", brasil: "BR", japan: "JP", nippon: "JP",
};

const byName = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));

function clean(s: string): string {
  return s.toLowerCase().replace(/[.\-_,']/g, " ").replace(/\s+/g, " ").trim();
}

export type CountryResult = { code: string; recognised: true } | { code: null; raw: string; recognised: false };

/** Blank means US (the sheet's convention). A code, an alias or a full name resolves; anything else is returned as typed and flagged. */
export function normalizeCountry(raw: string | null | undefined): CountryResult {
  const c = clean(raw ?? "");
  if (!c) return { code: "US", recognised: true };
  if (ALIASES[c]) return { code: ALIASES[c], recognised: true };
  const upper = c.toUpperCase();
  if (upper.length === 2 && CODES.includes(upper)) return { code: upper, recognised: true };
  const hit = byName.get(c);
  if (hit) return { code: hit, recognised: true };
  return { code: null, raw: (raw ?? "").trim(), recognised: false };
}

export function isCountryCode(s: string | null | undefined): boolean {
  return !!s && CODES.includes(s.toUpperCase());
}

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

/** "CA" → "California"; anything else as given. */
export function usStateName(abbr: string | null | undefined): string {
  if (!abbr) return "";
  return US_STATES[abbr.trim().toUpperCase()] ?? abbr.trim();
}
