import { createHash } from "node:crypto";

/**
 * Pure logic for the Google Sheet: header mapping, row parsing, fingerprints,
 * model matching, and building the row that lands on the month tab. No
 * network, no React. Tested in sheet.test.ts.
 */

export const INCOMING_TAB = "Incoming Watches";
export const ARCHIVE_TAB = "Archive";

/** The fields Pivot reads from a row, by the header names the sheet uses. Month tabs use two other names. */
const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  "date received": "date",
  name: "name",
  model: "model",
  "serial number": "serial",
  issue: "issue",
  "address line 1": "line1",
  "address line 2": "line2",
  city: "city",
  state: "state",
  "zip code": "zip",
  zip: "zip",
  country: "country",
  email: "email",
  "payment required?": "paymentRequired",
  "return to everett?": "returnToEverett",
  "return to everett": "returnToEverett",
};

export type SheetFields = {
  date: string;
  name: string;
  model: string;
  serial: string;
  issue: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email: string;
  paymentRequired: string;
  returnToEverett: string;
};

const EMPTY: SheetFields = {
  date: "", name: "", model: "", serial: "", issue: "", line1: "", line2: "", city: "", state: "", zip: "", country: "", email: "", paymentRequired: "", returnToEverett: "",
};

/** header name (lowercased, trimmed) → column index */
export function headerIndex(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key && !m.has(key)) m.set(key, i);
  });
  return m;
}

export function rowToFields(header: string[], row: string[]): SheetFields {
  const idx = headerIndex(header);
  const out: SheetFields = { ...EMPTY };
  for (const [h, i] of idx) {
    const field = HEADER_ALIASES[h];
    if (field) out[field as keyof SheetFields] = (row[i] ?? "").toString().trim();
  }
  return out;
}

/** "7/15/2026", "2026-09-28" or "" → "2026-07-15" | null. */
export function parseSheetDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** The sheet's own date style, for the month tab: "10/9/2026". */
export function sheetDateString(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const [y, mo, d] = iso.split("-").map(Number);
  return `${mo}/${d}/${y}`;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Stable identity for a row: its date, name, email, model and issue, normalised. Survives column reordering. */
export function fingerprint(f: SheetFields): string {
  const key = [parseSheetDate(f.date) ?? norm(f.date), norm(f.name), f.email.trim().toLowerCase(), norm(f.model), norm(f.issue)].join("\x1f");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export type ParsedIssue = { issue: string; claimRef: string | null; paymentAmount: number | null };

/** Split the automation's additions out of the customer's words. */
export function parseIssue(raw: string): ParsedIssue {
  let issue = raw.replace(/\r\n/g, "\n").trim();
  let claimRef: string | null = null;
  const claim = issue.match(/\[Claim:\s*([^\]]+)\]\s*$/i);
  if (claim) {
    claimRef = claim[1].trim();
    issue = issue.slice(0, claim.index).trim();
  }
  let paymentAmount: number | null = null;
  const pay = issue.match(/PAYMENT REQUIRED\s*-\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (pay) paymentAmount = Number(pay[1].replace(/,/g, ""));
  return { issue, claimRef, paymentAmount };
}

export function isTrue(s: string): boolean {
  return /^(true|yes|y|1)$/i.test(s.trim());
}

export type CatalogWatch = { id: string; name: string; warranty_months: number | null };

export type ModelMatch = { kind: "exact" | "fuzzy"; watch: CatalogWatch } | { kind: "none" };

/** Exact (normalised) name, else the longest catalog name contained in the model text, else none. */
export function matchModel(model: string, catalog: CatalogWatch[]): ModelMatch {
  const m = norm(model);
  if (!m) return { kind: "none" };
  const exact = catalog.find((w) => norm(w.name) === m);
  if (exact) return { kind: "exact", watch: exact };
  const contained = catalog
    .filter((w) => {
      const n = norm(w.name);
      return n.length >= 4 && (` ${m} `.includes(` ${n} `) || m.startsWith(n + " ") || m.endsWith(" " + n));
    })
    .sort((a, b) => b.name.length - a.name.length);
  return contained[0] ? { kind: "fuzzy", watch: contained[0] } : { kind: "none" };
}

export type IncomingRow = {
  fingerprint: string;
  /** 1-based row number in the sheet at read time. Positions shift; re-read before acting. */
  row: number;
  fields: SheetFields;
  raw: Record<string, string>;
  dateIso: string | null;
  name: string;
  email: string;
  phone: string;
  address: { line1: string; line2: string; city: string; state: string; postal_code: string; country: string };
  hasEmail: boolean;
  hasAddress: boolean;
  issue: string;
  claimRef: string | null;
  needsPayment: boolean;
  paymentAmount: number | null;
  returnToEverett: boolean;
  model: ModelMatch;
};

export function parseIncoming(values: string[][], catalog: CatalogWatch[]): IncomingRow[] {
  const [header, ...rows] = values;
  if (!header) return [];
  const out: IncomingRow[] = [];
  rows.forEach((r, i) => {
    const f = rowToFields(header, r);
    if (!f.name && !f.issue && !f.model) return; // blank filler row
    const { issue, claimRef, paymentAmount } = parseIssue(f.issue);
    const raw: Record<string, string> = {};
    header.forEach((h, k) => { if (h.trim()) raw[h.trim()] = (r[k] ?? "").toString(); });
    out.push({
      fingerprint: fingerprint(f),
      row: i + 2,
      fields: f,
      raw,
      dateIso: parseSheetDate(f.date),
      name: f.name,
      email: f.email.toLowerCase(),
      phone: "",
      address: { line1: f.line1, line2: f.line2, city: f.city, state: f.state, postal_code: f.zip, country: f.country },
      hasEmail: /\S+@\S+\.\S+/.test(f.email),
      hasAddress: !!(f.line1 && f.city && f.zip),
      issue,
      claimRef,
      needsPayment: isTrue(f.paymentRequired) || paymentAmount !== null,
      paymentAmount,
      returnToEverett: isTrue(f.returnToEverett),
      model: matchModel(f.model, catalog),
    });
  });
  return out;
}

/** "Oct 2026": the sheet's own month-tab convention, in the app time zone. */
export function monthTabTitle(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "America/Los_Angeles" }).format(now);
}

/** Build the destination row from the destination header, taking each column from the source fields by alias. */
export function buildRowForHeader(destHeader: string[], f: SheetFields): string[] {
  return destHeader.map((h) => {
    const field = HEADER_ALIASES[h.trim().toLowerCase()];
    if (!field) return "";
    const v = f[field as keyof SheetFields] ?? "";
    if (field === "paymentRequired" || field === "returnToEverett") return isTrue(v) ? "TRUE" : "FALSE";
    return v;
  });
}

/** Headers that must exist on a brand-new month tab, in the sheet's order. */
export const MONTH_TAB_HEADER = [
  "Date Received", "Name", "Model", "Serial Number", "Issue", "Address Line 1", "Address Line 2", "City", "State", "Zip", "Country", "Email",
  "Solution", "Notes", "Payment Required?", "Payment Received?", "Repair Completed?", "Shipped Back?", "Return to Everett",
];

/** First row (1-based) in a tab whose Name cell is empty, after the header. Ignores 'FALSE' filler in other columns. */
export function firstEmptyRow(values: string[][]): number {
  const [header, ...rows] = values;
  if (!header) return 2;
  const nameIx = headerIndex(header).get("name") ?? 1;
  for (let i = 0; i < rows.length; i++) {
    if (!(rows[i][nameIx] ?? "").toString().trim()) return i + 2;
  }
  return rows.length + 2;
}

/** Find a row by fingerprint in any tab that carries the Incoming columns (Incoming, Archive, month tabs). */
export function findRowByFingerprint(values: string[][], fp: string): number | null {
  const [header, ...rows] = values;
  if (!header) return null;
  for (let i = 0; i < rows.length; i++) {
    const f = rowToFields(header, rows[i]);
    if (!f.name && !f.issue) continue;
    if (fingerprint(f) === fp) return i + 2;
  }
  return null;
}

/** Sort key for month tab titles: "Oct 2026" → 2026*12+9. Unparseable titles sort first. */
export function monthTabOrder(title: string): number {
  const m = title.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return -1;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const ix = months.indexOf(m[1].slice(0, 3).toLowerCase());
  return ix < 0 ? -1 : Number(m[2]) * 12 + ix;
}
