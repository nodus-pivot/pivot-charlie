// Rewrites every customer email on every tab of the Nodus sheet to a plus-address of
// one inbox (pengcheng95+1@gmail.com, +2, +3 …), one number per distinct original
// address, so every test email lands in that inbox while Stripe still sees a
// different customer per person. Then updates the database to match:
// sheet_rows.raw, tickets.customer_email and ticket_messages.recipient.
//
// Originals and the mapping are saved to ~/src/pivot-emails-plus-map-<date>.json.
//
//   node --env-file=.env.local scripts/plus-address-emails.mjs          # dry run
//   node --env-file=.env.local scripts/plus-address-emails.mjs --write  # do it
import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";

const INBOX = process.env.TEST_INBOX ?? "pengcheng95@gmail.com";
const [INBOX_LOCAL, INBOX_DOMAIN] = INBOX.split("@");
const WRITE = process.argv.includes("--write");
const sa = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8"));
const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// One plus-address per distinct original, numbered in order of first sight.
const map = new Map();
const plusRe = new RegExp(`^${INBOX_LOCAL.replace(/[.+]/g, "\\$&")}(\\+\\d+)?@${INBOX_DOMAIN.replace(/\./g, "\\.")}$`, "i");
export function target(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  if (plusRe.test(s)) return null; // already the inbox or one of its plus-addresses
  if (!map.has(s)) map.set(s, `${INBOX_LOCAL}+${map.size + 1}@${INBOX_DOMAIN}`);
  return map.get(s);
}

const meta = await call("", { params: { fields: "sheets.properties(title)" } });
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
    let n = 0;
    for (let r = 1; r < rows.length; r++) {
      const cell = rows[r]?.[c];
      const next = target(cell);
      if (next === null) continue;
      (backup[title] ??= []).push({ cell: `${col}${r + 1}`, was: cell, now: next });
      updates.push({ range: `${quote(title)}!${col}${r + 1}`, values: [[next]] });
      n++;
      changed++;
    }
    console.log(`${title.padEnd(18)} ${header[c]}: ${n} cells`);
  }
}
console.log(`\n${changed} cells across ${Object.keys(backup).length} tabs · ${map.size} distinct addresses so far`);

// Database rows: same mapping, new numbers for anything the sheet did not have.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [{ data: ledger }, { data: tickets }, { data: msgs }] = await Promise.all([
  sb.from("sheet_rows").select("id, raw"),
  sb.from("tickets").select("id, number, customer_email").not("customer_email", "is", null),
  sb.from("ticket_messages").select("id, recipient").eq("channel", "email"),
]);
const ledgerPatches = [];
for (const row of ledger ?? []) {
  const raw = { ...(row.raw ?? {}) };
  let touched = false;
  for (const k of Object.keys(raw)) if (/email/i.test(k)) { const n = target(raw[k]); if (n !== null) { raw[k] = n; touched = true; } }
  if (touched) ledgerPatches.push({ id: row.id, raw });
}
const ticketPatches = (tickets ?? []).map((t) => ({ id: t.id, number: t.number, was: t.customer_email, now: target(t.customer_email) })).filter((t) => t.now !== null);
const msgPatches = (msgs ?? []).map((m) => ({ id: m.id, now: target(m.recipient) })).filter((m) => m.now !== null);
console.log(`database: ${ledgerPatches.length} sheet rows, ${ticketPatches.length} tickets, ${msgPatches.length} logged emails · ${map.size} distinct addresses in all`);
for (const t of ticketPatches) console.log(`  ${t.number}: ${t.was} → ${t.now}`);
if (!WRITE) { console.log("dry run; pass --write to apply"); process.exit(0); }

const stamp = new Date().toISOString().slice(0, 10);
const file = `${homedir()}/src/pivot-emails-plus-map-${stamp}.json`;
await writeFile(file, JSON.stringify({ inbox: INBOX, map: Object.fromEntries(map), sheet: backup, tickets: ticketPatches }, null, 2));
console.log("mapping and originals written to", file);

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

for (const p of ledgerPatches) await sb.from("sheet_rows").update({ raw: p.raw }).eq("id", p.id);
for (const p of ticketPatches) await sb.from("tickets").update({ customer_email: p.now }).eq("id", p.id);
for (const p of msgPatches) await sb.from("ticket_messages").update({ recipient: p.now }).eq("id", p.id);
console.log(`database updated: ${ledgerPatches.length} sheet rows, ${ticketPatches.length} tickets, ${msgPatches.length} logged emails`);
