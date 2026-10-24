// Rewrites every email on every tab of the Nodus sheet to <local-part>@test.com so
// nothing we send while testing reaches a real customer. Backs the originals up
// to ~/src/pivot-sheet-emails-backup-<date>.json first, then updates the
// database to match: sheet_rows.raw (so row fingerprints still line up) and
// tickets.customer_email on tickets created from the sheet.
//
//   node --env-file=.env.local scripts/scrub-sheet-emails.mjs          # dry run: counts only
//   node --env-file=.env.local scripts/scrub-sheet-emails.mjs --write  # do it
import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";

const WRITE = process.argv.includes("--write");
const sa = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8"));
const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Sheets allows 60 reads a minute per user: pace the calls and back off on 429.
const call = async (path, init = {}) => {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await jwt.request({ url: url.toString(), method: init.method ?? "GET", data: init.body, headers: init.body ? { "Content-Type": "application/json" } : undefined });
      await sleep(1100);
      return res.data;
    } catch (e) {
      if (e?.response?.status === 429 && attempt < 5) { console.log("  quota hit, waiting 30s"); await sleep(30000); continue; }
      throw e;
    }
  }
};
const quote = (t) => `'${t.replace(/'/g, "''")}'`;
const colLetter = (i) => { let s = ""; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

const KEEP = /@(test\.com|example\.com|pivot\.test)$/i;
export function scrub(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^([^\s@]+)@([^\s@]+\.[^\s@]+)$/);
  if (!m || KEEP.test(s)) return null;
  return `${m[1]}@test.com`;
}

const meta = await call("", { params: { fields: "sheets.properties(title,gridProperties.rowCount)" } });
const backup = {};
const updates = [];
let changed = 0;
for (const { properties: p } of meta.sheets) {
  const title = p.title;
  const data = await call(`/values/${encodeURIComponent(quote(title))}`, { params: { valueRenderOption: "FORMULA" } });
  const rows = data.values ?? [];
  const header = rows[0] ?? [];
  const cols = header.map((h, i) => (/email/i.test(String(h)) ? i : -1)).filter((i) => i >= 0);
  if (!cols.length) continue;
  for (const c of cols) {
    const col = colLetter(c);
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const cell = rows[r]?.[c];
      const next = scrub(cell);
      if (next === null) continue;
      (backup[title] ??= []).push({ cell: `${col}${r + 1}`, was: cell });
      updates.push({ range: `${quote(title)}!${col}${r + 1}`, values: [[next]] });
      out.push(next);
      changed++;
    }
    console.log(`${title.padEnd(18)} ${header[c]}: ${out.length} cells`);
  }
}
console.log(`\n${changed} cells across ${Object.keys(backup).length} tabs`);
if (!WRITE) { console.log("dry run; pass --write to apply"); process.exit(0); }

const stamp = new Date().toISOString().slice(0, 10);
const file = `${homedir()}/src/pivot-sheet-emails-backup-${stamp}.json`;
await writeFile(file, JSON.stringify(backup, null, 2));
console.log("backup written to", file);

// One batch per tab; a protected cell fails the whole batch, so fall back to
// cell-by-cell for that tab and report what could not be changed.
const skipped = [];
const byTab = new Map();
for (const u of updates) { const t = u.range.split("!")[0]; (byTab.get(t) ?? byTab.set(t, []).get(t)).push(u); }
for (const [tab, list] of byTab) {
  try {
    await call("/values:batchUpdate", { method: "POST", body: { valueInputOption: "RAW", data: list } });
    console.log(`sheet: ${tab} ${list.length} cells`);
  } catch (e) {
    if (!/protected/i.test(e?.message ?? "")) throw e;
    let ok = 0;
    for (const u of list) {
      try { await call(`/values/${encodeURIComponent(u.range)}`, { method: "PUT", params: { valueInputOption: "RAW" }, body: { values: u.values } }); ok++; }
      catch (e2) { if (/protected/i.test(e2?.message ?? "")) skipped.push(u.range); else throw e2; }
    }
    console.log(`sheet: ${tab} ${ok} cells, ${list.length - ok} protected`);
  }
}
if (skipped.length) console.log("protected, left as they were:", skipped.join(", "));

// Database: sheet ledger rows keep their fingerprint only if raw.Email changes the same way.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: ledger } = await sb.from("sheet_rows").select("id, raw");
let ledgerN = 0;
for (const row of ledger ?? []) {
  const raw = { ...(row.raw ?? {}) };
  let touched = false;
  for (const k of Object.keys(raw)) if (/email/i.test(k)) { const n = scrub(raw[k]); if (n !== null) { raw[k] = n; touched = true; } }
  if (touched) { await sb.from("sheet_rows").update({ raw }).eq("id", row.id); ledgerN++; }
}
const { data: tickets } = await sb.from("tickets").select("id, customer_email").not("customer_email", "is", null);
let ticketN = 0;
for (const t of tickets ?? []) {
  const n = scrub(t.customer_email);
  if (n !== null) { await sb.from("tickets").update({ customer_email: n }).eq("id", t.id); ticketN++; }
}
const { data: msgs } = await sb.from("ticket_messages").select("id, recipient").eq("channel", "email");
let msgN = 0;
for (const m of msgs ?? []) {
  const n = scrub(m.recipient);
  if (n !== null) { await sb.from("ticket_messages").update({ recipient: n }).eq("id", m.id); msgN++; }
}
console.log(`database: ${ledgerN} sheet rows, ${ticketN} tickets, ${msgN} logged emails updated`);
