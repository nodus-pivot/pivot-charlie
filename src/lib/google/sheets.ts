import "server-only";
import { JWT } from "google-auth-library";

/**
 * The one Google Sheets client. Acts as the service account, which must be
 * an Editor on the sheet. Imported only by features/intake: reading the
 * Incoming tab, moving a row to the month tab or Archive, and writing the
 * four status cells. Nothing else in the app talks to Google.
 */

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export type TabMeta = { title: string; sheetId: number; index: number; rowCount: number };

let jwt: JWT | null = null;
function client(): JWT {
  if (jwt) return jwt;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_B64 is not set");
  const sa = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { client_email: string; private_key: string };
  jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return jwt;
}

function sheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID is not set");
  return id;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown; params?: Record<string, string> }): Promise<T> {
  const url = new URL(`${BASE}/${sheetId()}${path}`);
  for (const [k, v] of Object.entries(init?.params ?? {})) url.searchParams.set(k, v);
  const res = await client().request<T>({
    url: url.toString(),
    method: init?.method ?? "GET",
    data: init?.body,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  return res.data;
}

/** A1 quoting for tab titles with spaces. */
export function tabRange(title: string, range?: string): string {
  const quoted = `'${title.replace(/'/g, "''")}'`;
  return range ? `${quoted}!${range}` : quoted;
}

export async function listTabs(): Promise<TabMeta[]> {
  const data = await call<{ sheets: { properties: { title: string; sheetId: number; index: number; gridProperties: { rowCount: number } } }[] }>("", {
    params: { fields: "sheets.properties(title,sheetId,index,gridProperties.rowCount)" },
  });
  return data.sheets.map((s) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
    index: s.properties.index,
    rowCount: s.properties.gridProperties.rowCount,
  }));
}

/** Every row of a tab as displayed strings. Row 0 is the header. Trailing empty cells are dropped by the API. */
export async function readTab(title: string): Promise<string[][]> {
  const data = await call<{ values?: string[][] }>(`/values/${encodeURIComponent(tabRange(title))}`, {
    params: { valueRenderOption: "FORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" },
  });
  return data.values ?? [];
}

/** Write one row at a 1-based row number (used instead of append: the month tabs have 'FALSE' filler far below the data). */
export async function writeRow(title: string, row: number, values: string[]): Promise<void> {
  const range = tabRange(title, `A${row}`);
  await call(`/values/${encodeURIComponent(range)}`, {
    method: "PUT",
    params: { valueInputOption: "RAW" },
    body: { range, majorDimension: "ROWS", values: [values] },
  });
}

export async function writeCell(title: string, a1: string, value: string): Promise<void> {
  const range = tabRange(title, a1);
  await call(`/values/${encodeURIComponent(range)}`, {
    method: "PUT",
    params: { valueInputOption: "RAW" },
    body: { range, majorDimension: "ROWS", values: [[value]] },
  });
}

/** Delete one row by its 1-based number. Rows below shift up. */
export async function deleteRow(tabSheetId: number, row: number): Promise<void> {
  await call(":batchUpdate", {
    method: "POST",
    body: { requests: [{ deleteDimension: { range: { sheetId: tabSheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }] },
  });
}

/** Add a tab at a position (0-based) and return its sheetId. */
export async function addTab(title: string, index: number): Promise<number> {
  const data = await call<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(":batchUpdate", {
    method: "POST",
    body: { requests: [{ addSheet: { properties: { title, index, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  return data.replies[0].addSheet.properties.sheetId;
}

/** Column letter for a 0-based index: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
