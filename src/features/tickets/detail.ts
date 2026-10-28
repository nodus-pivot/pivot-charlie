import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Address } from "@/lib/address";
import { STEPS, type Step } from "@/features/pipeline";
import type { StepRecord } from "./summary";
import { fetchSlackReplies } from "@/lib/slack";
import { fetchInvoice, stripeConfigured, stripeError } from "@/lib/stripe";

type Tables = Database["public"]["Tables"];
export type TicketRow = Tables["tickets"]["Row"];
export type StepRow = Tables["ticket_steps"]["Row"];
export type MessageRow = Tables["ticket_messages"]["Row"];
export type TestRow = Tables["ticket_tests"]["Row"];
export type PhotoRow = Tables["ticket_photos"]["Row"];
export type InvoiceRow = Tables["ticket_invoices"]["Row"];
export type EventRow = Tables["ticket_events"]["Row"] & { actor_name: string | null };

export type TicketDetail = {
  ticket: TicketRow & { ship_to: Address | null };
  /** One record per step, in rail order, with the doer's name resolved. */
  steps: StepRecord[];
  messages: MessageRow[];
  /** Newest first; the open one (if any) was checked against Stripe on this load. */
  invoices: InvoiceRow[];
  tests: TestRow[];
  photos: PhotoRow[];
  events: EventRow[];
  sheetRow: { moved_to_tab: string | null; moved_at: string | null } | null;
};

/** Everything a ticket page needs, in one round trip per table. RLS decides visibility; null means not found or not yours. */
export const getTicketDetail = cache(async (number: string): Promise<TicketDetail | null> => {
  const supabase = await createClient();
  const { data: ticket } = await supabase.from("tickets").select("*").eq("number", number).maybeSingle();
  if (!ticket) return null;

  const [steps, messages, invoices, tests, photos, events, sheetRow] = await Promise.all([
    supabase.from("ticket_steps").select("*").eq("ticket_id", ticket.id),
    supabase.from("ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at"),
    supabase.from("ticket_invoices").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: false }),
    supabase.from("ticket_tests").select("*").eq("ticket_id", ticket.id).order("created_at"),
    supabase.from("ticket_photos").select("*").eq("ticket_id", ticket.id).order("sort"),
    supabase.from("ticket_events").select("*").eq("ticket_id", ticket.id).order("created_at"),
    ticket.sheet_row_id ? supabase.from("sheet_rows").select("moved_to_tab, moved_at").eq("id", ticket.sheet_row_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const [messageRows, invoiceRows] = await Promise.all([refreshReplies(supabase, messages.data ?? []), syncInvoices(supabase, invoices.data ?? [])]);
  // A paid invoice ticks the payment step through a trigger: read the steps again so the page shows it.
  const paidNow = invoiceRows.some((i, k) => i.status === "paid" && invoices.data?.[k]?.status !== "paid");
  const stepRows = paidNow ? (await supabase.from("ticket_steps").select("*").eq("ticket_id", ticket.id)).data ?? steps.data : steps.data;

  const peopleIds = [
    ...(events.data ?? []).map((e) => e.actor_id),
    ...(steps.data ?? []).map((s) => s.done_by),
    ...(messages.data ?? []).map((m) => m.created_by),
  ].filter((x): x is string => !!x);
  const ids = [...new Set(peopleIds)];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name]));

  return {
    ticket: { ...ticket, ship_to: (ticket.ship_to as Address | null) ?? null },
    // Rail order, whatever order Postgres returns the rows in (an update moves a row).
    steps: (stepRows ?? [])
      .filter((s) => s.stage !== "closed")
      .sort((a, b) => STEPS.indexOf(a.stage as Step) - STEPS.indexOf(b.stage as Step))
      .map((s) => ({
        stage: s.stage as Step,
        answer: s.answer,
        notes: s.notes,
        done_at: s.done_at,
        done_by_name: s.done_by ? (nameOf.get(s.done_by) ?? null) : null,
        skipped: s.skipped,
        updated_at: s.updated_at,
      })),
    messages: messageRows,
    invoices: invoiceRows,
    tests: tests.data ?? [],
    photos: photos.data ?? [],
    events: (events.data ?? []).map((e) => ({ ...e, actor_name: e.actor_id ? (nameOf.get(e.actor_id) ?? null) : null })),
    sheetRow: sheetRow.data ?? null,
  };
});

const REPLIES_TTL_MS = 2 * 60_000;

/**
 * The newest Slack post of each kind gets its reply count refreshed when
 * the stored one is older than two minutes. Errors (no history scope, a
 * seeded ts) only stamp replies_checked_at so the page never hammers Slack.
 */
async function refreshReplies(supabase: Awaited<ReturnType<typeof createClient>>, rows: MessageRow[]): Promise<MessageRow[]> {
  const now = Date.now();
  const latestByKind = new Map<string, MessageRow>();
  for (const m of rows) if (m.channel === "slack" && m.external_id) latestByKind.set(m.kind, m);
  const stale = [...latestByKind.values()].filter((m) => !m.replies_checked_at || now - new Date(m.replies_checked_at).getTime() > REPLIES_TTL_MS);
  if (!stale.length) return rows;
  const updates = await Promise.all(
    stale.map(async (m) => {
      const r = await fetchSlackReplies(m.external_id!);
      const checked = new Date(now).toISOString();
      const patch = r.ok ? { reply_count: r.count, last_reply: r.last, replies_checked_at: checked, replies_error: null } : { replies_checked_at: checked, replies_error: r.error };
      await supabase.from("ticket_messages").update(patch).eq("id", m.id);
      return [m.id, { ...m, ...patch }] as const;
    }),
  );
  const byId = new Map(updates);
  return rows.map((m) => byId.get(m.id) ?? m);
}

const INVOICE_TTL_MS = 2 * 60_000;

/**
 * The open invoice is looked up at Stripe when its last check is older than
 * two minutes: paid and void come from Stripe, expired is ours (past due_at
 * and still unpaid). Seeded ids (in_seed…) and a missing key only stamp
 * checked_at. Paid, void and expired are final.
 */
async function syncInvoices(supabase: Awaited<ReturnType<typeof createClient>>, rows: InvoiceRow[]): Promise<InvoiceRow[]> {
  const open = rows.find((i) => i.status === "open");
  if (!open?.stripe_invoice_id) return rows;
  const now = Date.now();
  if (open.checked_at && now - new Date(open.checked_at).getTime() < INVOICE_TTL_MS) return rows;
  const checked = new Date(now).toISOString();
  let patch: Partial<InvoiceRow> = { checked_at: checked };
  if (open.stripe_invoice_id.startsWith("in_seed") || !stripeConfigured()) {
    patch = { checked_at: checked };
  } else {
    try {
      const r = await fetchInvoice(open.stripe_invoice_id);
      if (r.status === "paid") patch = { status: "paid", paid_at: r.paidAt, checked_at: checked, error: null };
      else if (r.status === "void") patch = { status: "void", voided_at: checked, checked_at: checked, error: null };
      else if (open.due_at && new Date(open.due_at).getTime() < now) patch = { status: "expired", checked_at: checked, error: null };
      else patch = { checked_at: checked, error: null };
    } catch (e) {
      patch = { checked_at: checked, error: stripeError(e) };
    }
  }
  await supabase.from("ticket_invoices").update(patch).eq("id", open.id);
  return rows.map((i) => (i.id === open.id ? { ...i, ...patch } : i));
}

/** Who posted a message, for the Slack card's "Posted · Wes" line. */
export function messageAuthors(detail: TicketDetail): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of detail.events) if (e.actor_id && e.actor_name) m.set(e.actor_id, e.actor_name);
  return m;
}
