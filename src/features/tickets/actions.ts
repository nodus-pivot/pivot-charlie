"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/queries";
import { canActOn, isAdminOf, type Stage } from "@/features/pipeline";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function load(number: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "You're signed out." };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, stage, workspace_id, brand_id, number").eq("number", number).maybeSingle();
  if (!t) return { ok: false as const, error: "Ticket not found." };
  return { ok: true as const, ...t, grants: user.grants, supabase, userId: user.id };
}

function refresh(number: string) {
  revalidatePath(`/service-center/tickets/${number}`);
  revalidatePath("/service-center");
}

/** Clean the database's own gate messages for the UI. */
function message(e: { message: string }): string {
  return e.message.replace(/^.*?:\s(?=[a-z])/i, "").replace(/\s*\(SQLSTATE.*\)$/, "");
}

/* ---------------------------------------------------------------- dossier */

const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(500)).transform((v) => v || null);

const detailsInput = z.object({
  customerName: z.string().trim().min(1, "The customer needs a name.").max(200),
  customerEmail: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""), z.string().max(200)).transform((v) => v || null).pipe(z.email("Enter a valid email address.").nullable()),
  customerPhone: optional,
  shipTo: z.object({ line1: optional, line2: optional, city: optional, state: optional, postal_code: optional, country: optional }),
  watchId: z.uuid(),
  serial: optional,
  coverage: z.enum(["warranty", "paid"]).nullable(),
});
export type DetailsInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shipTo: { line1: string; line2: string; city: string; state: string; postal_code: string; country: string };
  watchId: string;
  serial: string;
  coverage: "warranty" | "paid" | null;
};

/** The dossier's editable fields. Allowed at Check in for anyone who can act there, and for admins at any stage. */
export async function updateTicketDetails(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = detailsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const t = await load(number);
  if (!t.ok) return t;
  const allowed = isAdminOf(t.grants, t.workspace_id) || (t.stage === "check_in" && canActOn(t.grants, "check_in", t.workspace_id, t.brand_id));
  if (!allowed) return { ok: false, error: "Details can only be changed at Check in." };
  const d = parsed.data;
  const hasAddress = Object.values(d.shipTo).some(Boolean);
  const { error } = await t.supabase
    .from("tickets")
    .update({
      customer_name: d.customerName,
      customer_email: d.customerEmail,
      customer_phone: d.customerPhone,
      ship_to: hasAddress ? d.shipTo : null,
      watch_id: d.watchId,
      serial: d.serial,
      coverage: d.coverage,
    })
    .eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

const flagsInput = z.object({ priority: z.boolean(), needsPayment: z.boolean(), returnToEverett: z.boolean() });

export async function setFlags(number: string, raw: z.infer<typeof flagsInput>): Promise<ActionResult> {
  const parsed = flagsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the flags." };
  const t = await load(number);
  if (!t.ok) return t;
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id) && !isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Your role can't change this ticket." };
  const { error } = await t.supabase
    .from("tickets")
    .update({ priority: parsed.data.priority, needs_payment: parsed.data.needsPayment, return_to_everett: parsed.data.returnToEverett })
    .eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- check in */

export async function setOnBench(number: string, on: boolean): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "check_in") return { ok: false, error: "The watch was already checked in." };
  if (!canActOn(t.grants, "check_in", t.workspace_id, t.brand_id)) return { ok: false, error: "Your role can't check watches in." };
  const { error } = await t.supabase.from("tickets").update({ received_at: on ? new Date().toISOString() : null }).eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Check in → Inspect. The database gate requires received_at; the email is logged, not sent. */
export async function confirmCheckIn(number: string, opts: { emailCustomer: boolean }): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "check_in") return { ok: false, error: "Already past Check in." };
  const { error } = await t.supabase.rpc("set_stage", { p_ticket: t.id, p_to: "inspect" });
  if (error) return { ok: false, error: message(error) };
  if (opts.emailCustomer) {
    await t.supabase.from("ticket_events").insert({
      ticket_id: t.id,
      type: "email_logged",
      actor_id: t.userId,
      body: "Request received",
      payload: { template: "request_received" },
    });
  }
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- shared */

const stageEnum = z.enum(["check_in", "inspect", "supply", "fix", "test", "ship", "closed"]);

/** Any forward move; the database enforces order and gates. */
export async function advanceTicket(number: string, to: Stage, opts: { override?: boolean } = {}): Promise<ActionResult> {
  const parsed = stageEnum.safeParse(to);
  if (!parsed.success) return { ok: false, error: "Unknown stage." };
  const t = await load(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.rpc("set_stage", { p_ticket: t.id, p_to: parsed.data, p_override: !!opts.override });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function sendBack(number: string, to: Stage, note?: string): Promise<ActionResult> {
  const parsed = stageEnum.safeParse(to);
  if (!parsed.success) return { ok: false, error: "Unknown stage." };
  const t = await load(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.rpc("set_stage", { p_ticket: t.id, p_to: parsed.data, p_kind: "sent_back" });
  if (error) return { ok: false, error: message(error) };
  if (note?.trim()) {
    await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "comment", actor_id: t.userId, body: note.trim() });
  }
  refresh(number);
  return { ok: true };
}

export async function addComment(number: string, body: string): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 2000) return { ok: false, error: "Keep it under 2000 characters." };
  const t = await load(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "comment", actor_id: t.userId, body: text });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}
