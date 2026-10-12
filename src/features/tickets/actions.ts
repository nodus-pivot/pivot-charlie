"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/queries";
import { COMPONENTS, canActOn, isAdminOf, type Component, type Stage } from "@/features/pipeline";
import { createClient } from "@/lib/supabase/server";
import { drainQuietly } from "@/features/intake/writebacks";
import { countryField } from "@/features/intake/schema";
import { photoPathBelongsTo } from "@/lib/photos";

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
  shipTo: z.object({ line1: optional, line2: optional, city: optional, state: optional, postal_code: optional, country: countryField }),
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
  // Stage emails are logged, not sent, until a mailer exists. Request received and On its way are logged by their own steps.
  const email = parsed.data === "fix" ? { template: "repair_in_progress", body: "Repair in progress" } : parsed.data === "test" ? { template: "testing", body: "Testing" } : null;
  if (email && t.stage !== parsed.data) {
    const { data: already } = await t.supabase.from("ticket_events").select("id").eq("ticket_id", t.id).eq("type", "email_logged").contains("payload", { template: email.template }).limit(1);
    if (!already?.length) {
      await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "email_logged", actor_id: t.userId, body: email.body, payload: { template: email.template } });
    }
  }
  await drainQuietly(t.id);
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

/* ---------------------------------------------------------------- inspect & fix: findings */

const findingInput = z.object({
  component: z.enum(COMPONENTS as [Component, ...Component[]]),
  condition: z.enum(["worn", "scratched", "discolored", "cracked"]).nullable(),
  action: z.enum(["fix", "replace"]),
  partId: z.uuid().nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type FindingInput = z.infer<typeof findingInput>;

/** Add or change the finding for a component. Allowed on Inspect and Fix (rows found on the bench) by whoever owns the stage. */
export async function setFinding(number: string, raw: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = findingInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the finding." };
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "inspect" && t.stage !== "fix") return { ok: false, error: "Findings are recorded on Inspect and Fix." };
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id)) return { ok: false, error: "Your role can't record findings." };
  const f = parsed.data;
  const { data: existing } = await t.supabase.from("ticket_findings").select("id").eq("ticket_id", t.id).eq("component", f.component).maybeSingle();
  const values = { condition: f.condition, action: f.action, part_id: f.action === "replace" ? f.partId : null, note: f.note ?? null };
  const res = existing
    ? await t.supabase.from("ticket_findings").update(values).eq("id", existing.id).select("id").single()
    : await t.supabase.from("ticket_findings").insert({ ticket_id: t.id, component: f.component, found_at_stage: t.stage, created_by: t.userId, ...values }).select("id").single();
  if (res.error) return { ok: false, error: message(res.error) };
  refresh(number);
  return { ok: true, id: res.data.id };
}

export async function removeFinding(number: string, component: Component): Promise<ActionResult> {
  const parsed = z.enum(COMPONENTS as [Component, ...Component[]]).safeParse(component);
  if (!parsed.success) return { ok: false, error: "Unknown component." };
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "inspect" && t.stage !== "fix") return { ok: false, error: "Findings are recorded on Inspect and Fix." };
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id)) return { ok: false, error: "Your role can't record findings." };
  const { error } = await t.supabase.from("ticket_findings").delete().eq("ticket_id", t.id).eq("component", parsed.data);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

const noteStage = z.enum(["inspect", "supply", "fix", "test"]);

/** The free-text note under a step. Saved on blur. */
export async function saveStageNote(number: string, stage: "inspect" | "supply" | "fix" | "test", note: string): Promise<ActionResult> {
  const parsed = noteStage.safeParse(stage);
  if (!parsed.success) return { ok: false, error: "Unknown step." };
  const text = note.trim().slice(0, 2000) || null;
  const t = await load(number);
  if (!t.ok) return t;
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id) && !isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Your role can't edit this ticket." };
  const update =
    parsed.data === "inspect" ? { inspect_note: text } : parsed.data === "supply" ? { supply_note: text } : parsed.data === "fix" ? { fix_note: text } : { test_note: text };
  const { error } = await t.supabase.from("tickets").update(update).eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- supply: parts */

async function loadForSupply(number: string) {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "supply") return { ok: false as const, error: "Parts are handled on the Supply step." };
  if (!canActOn(t.grants, "supply", t.workspace_id, t.brand_id)) return { ok: false as const, error: "Your role can't handle parts." };
  return t;
}

export async function setPartHave(number: string, rowId: string, have: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(rowId).success) return { ok: false, error: "Unknown part row." };
  const t = await loadForSupply(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.from("ticket_parts").update({ have_it: have }).eq("id", rowId).eq("ticket_id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function markPartArrived(number: string, rowId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(rowId).success) return { ok: false, error: "Unknown part row." };
  const t = await loadForSupply(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.from("ticket_parts").update({ arrived_at: new Date().toISOString() }).eq("id", rowId).eq("ticket_id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Stamp requested_at on every part still needed and log the message to the brand rep. Parks the ticket (derived). */
export async function requestParts(number: string): Promise<ActionResult & { message?: string }> {
  const t = await loadForSupply(number);
  if (!t.ok) return t;
  const { data: rows } = await t.supabase
    .from("ticket_parts")
    .select("id, qty, label, part:parts(name, sku)")
    .eq("ticket_id", t.id)
    .eq("have_it", false)
    .is("arrived_at", null);
  if (!rows?.length) return { ok: false, error: "Every part is in hand already." };
  const now = new Date().toISOString();
  const { error } = await t.supabase.from("ticket_parts").update({ requested_at: now }).in("id", rows.map((r) => r.id));
  if (error) return { ok: false, error: message(error) };
  const list = rows.map((r) => {
    const part = r.part as unknown as { name: string; sku: string } | null;
    return `${r.qty}× ${r.label ?? part?.name ?? "part"}${part?.sku ? ` ${part.sku}` : ""}`;
  });
  const body = `Need ${list.join(", ")} for ${t.number}`;
  await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "parts_requested", actor_id: t.userId, body, payload: { part_rows: rows.map((r) => r.id) } });
  refresh(number);
  return { ok: true, message: body };
}

const spareInput = z.object({ partId: z.uuid(), label: z.string().trim().max(120).nullable(), qty: z.number().int().min(1).max(20) });

/** A part beyond the findings, e.g. a spare bezel insert. */
export async function addSparePart(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = spareInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pick a part." };
  const t = await loadForSupply(number);
  if (!t.ok) return t;
  const { error } = await t.supabase
    .from("ticket_parts")
    .insert({ ticket_id: t.id, part_id: parsed.data.partId, label: parsed.data.label, qty: parsed.data.qty, created_by: t.userId });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function removeSparePart(number: string, rowId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(rowId).success) return { ok: false, error: "Unknown part row." };
  const t = await loadForSupply(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.from("ticket_parts").delete().eq("id", rowId).eq("ticket_id", t.id).is("finding_id", null);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- fix */

async function loadForFix(number: string) {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "fix") return { ok: false as const, error: "That happens on the Fix step." };
  if (!canActOn(t.grants, "fix", t.workspace_id, t.brand_id)) return { ok: false as const, error: "Your role can't work the bench." };
  return t;
}

export async function markFindingDone(number: string, findingId: string, done: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(findingId).success) return { ok: false, error: "Unknown row." };
  const t = await loadForFix(number);
  if (!t.ok) return t;
  const { error } = await t.supabase
    .from("ticket_findings")
    .update(done ? { done_at: new Date().toISOString(), done_by: t.userId } : { done_at: null, done_by: null })
    .eq("id", findingId)
    .eq("ticket_id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function setFindingNote(number: string, findingId: string, note: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(findingId).success) return { ok: false, error: "Unknown row." };
  const t = await loadForFix(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.from("ticket_findings").update({ note: note.trim().slice(0, 500) || null }).eq("id", findingId).eq("ticket_id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Time on bench, entered by hand until the timer exists. */
export async function setBenchMinutes(number: string, minutes: number | null): Promise<ActionResult> {
  const parsed = z.number().int().min(0).max(60 * 24 * 30).nullable().safeParse(minutes);
  if (!parsed.success) return { ok: false, error: "Enter a time like 1:35." };
  const t = await loadForFix(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.from("tickets").update({ bench_minutes: parsed.data }).eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function setCoverage(number: string, coverage: "warranty" | "paid"): Promise<ActionResult> {
  const parsed = z.enum(["warranty", "paid"]).safeParse(coverage);
  if (!parsed.success) return { ok: false, error: "Unknown coverage." };
  const t = await load(number);
  if (!t.ok) return t;
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id) && !isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Your role can't change coverage." };
  const { error } = await t.supabase.from("tickets").update({ coverage: parsed.data, needs_payment: parsed.data === "paid" ? true : undefined }).eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- test */

const testKind = z.enum(["time", "water", "looks"]);
export type TestKind = z.infer<typeof testKind>;

async function loadForTest(number: string) {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "test") return { ok: false as const, error: "That happens on the Test step." };
  if (!canActOn(t.grants, "test", t.workspace_id, t.brand_id)) return { ok: false as const, error: "Your role can't run tests." };
  return t;
}

async function upsertTest(t: Extract<Awaited<ReturnType<typeof load>>, { ok: true }>, kind: TestKind, result: "pass" | "fail", note: string | null) {
  const { data: ticket } = await t.supabase.from("tickets").select("test_attempt").eq("id", t.id).single();
  const attempt = ticket?.test_attempt ?? 1;
  const { data: existing } = await t.supabase.from("ticket_tests").select("id").eq("ticket_id", t.id).eq("attempt", attempt).eq("kind", kind).maybeSingle();
  return existing
    ? t.supabase.from("ticket_tests").update({ result, note, created_by: t.userId }).eq("id", existing.id)
    : t.supabase.from("ticket_tests").insert({ ticket_id: t.id, attempt, kind, result, note, created_by: t.userId });
}

export async function passTest(number: string, kind: TestKind): Promise<ActionResult> {
  const parsed = testKind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown test." };
  const t = await loadForTest(number);
  if (!t.ok) return t;
  const { error } = await upsertTest(t, parsed.data, "pass", null);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Clear a pass (undo) for the current attempt. */
export async function clearTest(number: string, kind: TestKind): Promise<ActionResult> {
  const parsed = testKind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown test." };
  const t = await loadForTest(number);
  if (!t.ok) return t;
  const { data: ticket } = await t.supabase.from("tickets").select("test_attempt").eq("id", t.id).single();
  const { error } = await t.supabase.from("ticket_tests").delete().eq("ticket_id", t.id).eq("attempt", ticket?.test_attempt ?? 1).eq("kind", parsed.data);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Record the fail with its note, then send the watch back to Fix. The attempt counter bumps in set_stage. */
export async function failTest(number: string, kind: TestKind, note: string): Promise<ActionResult> {
  const parsed = testKind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown test." };
  const t = await loadForTest(number);
  if (!t.ok) return t;
  const text = note.trim().slice(0, 500) || null;
  const { error } = await upsertTest(t, parsed.data, "fail", text);
  if (error) return { ok: false, error: message(error) };
  const { error: e2 } = await t.supabase.rpc("set_stage", { p_ticket: t.id, p_to: "fix", p_kind: "sent_back" });
  if (e2) return { ok: false, error: message(e2) };
  const label = parsed.data === "time" ? "Time" : parsed.data === "water" ? "Water" : "Looks";
  await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "comment", actor_id: t.userId, body: `${label} test failed${text ? `: ${text.replace(/[.\s]+$/, "")}` : ""}. Back to Fix.` });
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- ship */

async function loadForShip(number: string) {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "ship") return { ok: false as const, error: "That happens on the Ship step." };
  if (!canActOn(t.grants, "ship", t.workspace_id, t.brand_id)) return { ok: false as const, error: "Your role can't ship." };
  return t;
}

const shipmentInput = z.object({
  carrier: z.enum(["usps", "ups", "fedex"]).nullable(),
  tracking: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(80)).transform((v) => v || null),
  handedOver: z.boolean(),
  signatureRequired: z.boolean(),
  emailCustomer: z.boolean(),
});
export type ShipmentInput = z.infer<typeof shipmentInput>;

/** The Ship form autosaves into the one shipments row per ticket. ship_to is snapshotted on every save. */
export async function saveShipment(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = shipmentInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the shipment." };
  const t = await loadForShip(number);
  if (!t.ok) return t;
  const { data: ticket } = await t.supabase.from("tickets").select("ship_to, return_to_everett, customer_name, workspace_id").eq("id", t.id).single();
  const { data: ws } = await t.supabase.from("workspaces").select("fulfillment_address").eq("id", t.workspace_id).single();
  const shipTo = ticket?.return_to_everett ? ws?.fulfillment_address : ticket?.ship_to ? { name: ticket.customer_name, ...(ticket.ship_to as object) } : null;
  const d = parsed.data;
  const { data: existing } = await t.supabase.from("shipments").select("id").eq("ticket_id", t.id).maybeSingle();
  const values = { carrier: d.handedOver ? null : d.carrier, tracking: d.handedOver ? null : d.tracking, handed_over: d.handedOver, signature_required: d.signatureRequired, email_customer: d.emailCustomer, ship_to: shipTo };
  const res = existing
    ? await t.supabase.from("shipments").update(values).eq("id", existing.id)
    : await t.supabase.from("shipments").insert({ ticket_id: t.id, created_by: t.userId, ...values });
  if (res.error) return { ok: false, error: message(res.error) };
  refresh(number);
  return { ok: true };
}

const addressOnly = z.object({ line1: optional, line2: optional, city: optional, state: optional, postal_code: optional, country: countryField });

/** Edit the customer's ship-to address from the Ship step. */
export async function updateShipTo(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = addressOnly.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the address." };
  const t = await loadForShip(number);
  if (!t.ok) return t;
  const hasAddress = Object.values(parsed.data).some(Boolean);
  const { error } = await t.supabase.from("tickets").update({ ship_to: hasAddress ? parsed.data : null }).eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function setPaymentReceived(number: string, received: boolean): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id) && !isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Your role can't record payments." };
  const { error } = await t.supabase.from("tickets").update({ payment_received: received }).eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  await drainQuietly(t.id);
  refresh(number);
  return { ok: true };
}

/** Ship → Closed. The database checks tracking or handover and the payment gate (override for admins). Logs the customer email if ticked. */
export async function shipTicket(number: string, opts: { override?: boolean } = {}): Promise<ActionResult> {
  const t = await loadForShip(number);
  if (!t.ok) return t;
  const { data: shipment } = await t.supabase.from("shipments").select("email_customer").eq("ticket_id", t.id).maybeSingle();
  const { error } = await t.supabase.rpc("set_stage", { p_ticket: t.id, p_to: "closed", p_override: !!opts.override });
  if (error) return { ok: false, error: message(error) };
  if (shipment?.email_customer) {
    await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "email_logged", actor_id: t.userId, body: "On its way", payload: { template: "on_its_way" } });
  }
  await drainQuietly(t.id);
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- closed */

/** Closed → Ship, owners and admins only (the database checks too). */
export async function reopenTicket(number: string): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "closed") return { ok: false, error: "Only a closed ticket can be reopened." };
  if (!isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Reopen is for owners and admins." };
  const { error } = await t.supabase.rpc("set_stage", { p_ticket: t.id, p_to: "ship", p_kind: "reopened" });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- customer address requests */

/** Accept or decline the latest address change the customer asked for from Check a repair. */
export async function resolveAddressRequest(number: string, eventId: string, accept: boolean): Promise<ActionResult> {
  if (!z.uuid().safeParse(eventId).success) return { ok: false, error: "Unknown request." };
  const t = await load(number);
  if (!t.ok) return t;
  if (!canActOn(t.grants, t.stage, t.workspace_id, t.brand_id) && !isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Your role can't change the address." };
  const { data: ev } = await t.supabase.from("ticket_events").select("id, payload").eq("id", eventId).eq("ticket_id", t.id).eq("type", "address_update_requested").maybeSingle();
  if (!ev) return { ok: false, error: "That request is gone." };
  if (accept) {
    const { error } = await t.supabase.from("tickets").update({ ship_to: ev.payload }).eq("id", t.id);
    if (error) return { ok: false, error: message(error) };
  }
  await t.supabase.from("ticket_events").insert({
    ticket_id: t.id,
    type: accept ? "address_update_accepted" : "address_update_declined",
    actor_id: t.userId,
    body: accept ? "Return address updated at the customer's request" : "Customer's address change declined",
    payload: ev.payload,
  });
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- photos */

const photoInput = z.object({ path: z.string().min(1).max(200), kind: z.enum(["customer", "bench"]) });

/** Record a photo the browser already put in Storage under tickets/<id>/. */
export async function addTicketPhoto(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = photoInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That photo didn't upload." };
  const t = await load(number);
  if (!t.ok) return t;
  if (!photoPathBelongsTo(parsed.data.path, "tickets", t.id)) return { ok: false, error: "That photo belongs to another ticket." };
  const { count } = await t.supabase.from("ticket_photos").select("id", { count: "exact", head: true }).eq("ticket_id", t.id).eq("kind", parsed.data.kind);
  const { error } = await t.supabase.from("ticket_photos").insert({ ticket_id: t.id, kind: parsed.data.kind, storage_path: parsed.data.path, sort: count ?? 0, uploaded_by: t.userId });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

export async function removeTicketPhoto(number: string, photoId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(photoId).success) return { ok: false, error: "Reload and try again." };
  const t = await load(number);
  if (!t.ok) return t;
  const { data: photo } = await t.supabase.from("ticket_photos").select("id, storage_path").eq("id", photoId).eq("ticket_id", t.id).maybeSingle();
  if (!photo) return { ok: false, error: "That photo is already gone." };
  const { error } = await t.supabase.from("ticket_photos").delete().eq("id", photo.id);
  if (error) return { ok: false, error: message(error) };
  await t.supabase.storage.from("photos").remove([photo.storage_path]);
  refresh(number);
  return { ok: true };
}
