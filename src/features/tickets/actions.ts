"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/queries";
import { STEPS, TEST_KINDS, TEST_LABELS, canActOn, isAdminOf, type Step, type TestKind } from "@/features/pipeline";
import { createClient } from "@/lib/supabase/server";
import { drainQuietly } from "@/features/intake/writebacks";
import { countryField } from "@/features/intake/schema";
import { photoPathBelongsTo } from "@/lib/photos";
import { appUrl, mrkdwn, postSlack } from "@/lib/slack";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function load(number: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "You're signed out." };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, stage, workspace_id, brand_id, number, needs_payment").eq("number", number).maybeSingle();
  if (!t) return { ok: false as const, error: "Ticket not found." };
  return { ok: true as const, ...t, grants: user.grants, supabase, userId: user.id, userName: user.profile.display_name };
}
type Loaded = Extract<Awaited<ReturnType<typeof load>>, { ok: true }>;

function refresh(number: string) {
  revalidatePath(`/service-center/tickets/${number}`);
  revalidatePath("/service-center");
}

/** Clean the database's own gate messages for the UI. */
function message(e: { message: string }): string {
  return e.message.replace(/^.*?:\s(?=[a-z])/i, "").replace(/\s*\(SQLSTATE.*\)$/, "");
}

function mayEdit(t: Loaded): boolean {
  return canActOn(t.grants, t.stage, t.workspace_id, t.brand_id) || isAdminOf(t.grants, t.workspace_id);
}

const stepEnum = z.enum(STEPS as [Step, ...Step[]]);
const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(500)).transform((v) => v || null);

/* ---------------------------------------------------------------- dossier */

const detailsInput = z.object({
  customerName: z.string().trim().min(1, "The customer needs a name.").max(200),
  customerEmail: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""), z.string().max(200)).transform((v) => v || null).pipe(z.email("Enter a valid email address.").nullable()),
  customerPhone: optional,
  shipTo: z.object({ line1: optional, line2: optional, city: optional, state: optional, postal_code: optional, country: countryField }),
  watch: z.string().trim().min(1, "Which watch is it?").max(120),
  serial: optional,
  coverage: z.enum(["warranty", "paid"]).nullable(),
});
export type DetailsInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shipTo: { line1: string; line2: string; city: string; state: string; postal_code: string; country: string };
  watch: string;
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
      watch: d.watch,
      serial: d.serial,
      coverage: d.coverage,
      needs_payment: d.coverage === "paid" ? true : undefined,
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
  if (!mayEdit(t)) return { ok: false, error: "Your role can't change this ticket." };
  const { error } = await t.supabase
    .from("tickets")
    .update({ priority: parsed.data.priority, needs_payment: parsed.data.needsPayment, return_to_everett: parsed.data.returnToEverett })
    .eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
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

/* ---------------------------------------------------------------- steps */

async function loadForStep(number: string, stage: Step) {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== stage) return { ok: false as const, error: `The ticket is not at ${stage.replace("_", " ")} any more. Reload.` };
  if (!canActOn(t.grants, stage, t.workspace_id, t.brand_id)) return { ok: false as const, error: "Your role doesn't own this step." };
  return t;
}

/** The step's Yes / No (or the big tick). On Inspect, No parks the ticket. */
export async function setStepAnswer(number: string, stage: Step, answer: boolean | null): Promise<ActionResult> {
  const parsed = stepEnum.safeParse(stage);
  if (!parsed.success) return { ok: false, error: "Unknown step." };
  const t = await loadForStep(number, parsed.data);
  if (!t.ok) return t;
  // Changing the Supply answer forgets an earlier "parts received".
  const patch = parsed.data === "supply" && answer !== false ? { answer, done_at: null, done_by: null } : { answer };
  const { error } = await t.supabase.from("ticket_steps").update(patch).eq("ticket_id", t.id).eq("stage", parsed.data);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** The step's free text: inspection comments, parts list, what you did, test notes. Saved on blur. */
export async function setStepNotes(number: string, stage: Step, notes: string): Promise<ActionResult> {
  const parsed = stepEnum.safeParse(stage);
  if (!parsed.success) return { ok: false, error: "Unknown step." };
  const t = await load(number);
  if (!t.ok) return t;
  if (!mayEdit(t)) return { ok: false, error: "Your role can't edit this ticket." };
  const { error } = await t.supabase.from("ticket_steps").update({ notes: notes.trim().slice(0, 4000) || null }).eq("ticket_id", t.id).eq("stage", parsed.data);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Supply: "Parts received" ticks the step done without advancing. */
export async function setPartsReceived(number: string, received: boolean): Promise<ActionResult> {
  const t = await loadForStep(number, "supply");
  if (!t.ok) return t;
  const { error } = await t.supabase
    .from("ticket_steps")
    .update(received ? { done_at: new Date().toISOString(), done_by: t.userId } : { done_at: null, done_by: null })
    .eq("ticket_id", t.id)
    .eq("stage", "supply");
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Forward one step. The database enforces the gate; Check in and Ship also log their customer email. */
export async function advanceTicket(number: string, opts: { override?: boolean } = {}): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  const from = t.stage;
  const { error } = await t.supabase.rpc("advance", { p_ticket: t.id, p_override: !!opts.override });
  if (error) return { ok: false, error: message(error) };
  if (from === "check_in") await logEmail(t, "received");
  if (from === "ship") await logEmail(t, "shipped");
  await drainQuietly(t.id);
  refresh(number);
  return { ok: true };
}

export async function sendBack(number: string, to: Step, note?: string): Promise<ActionResult> {
  const parsed = stepEnum.safeParse(to);
  if (!parsed.success) return { ok: false, error: "Unknown step." };
  const t = await load(number);
  if (!t.ok) return t;
  const { error } = await t.supabase.rpc("send_back", { p_ticket: t.id, p_to: parsed.data });
  if (error) return { ok: false, error: message(error) };
  if (note?.trim()) {
    await t.supabase.from("ticket_events").insert({ ticket_id: t.id, type: "comment", actor_id: t.userId, body: note.trim() });
  }
  refresh(number);
  return { ok: true };
}

/** Inspect: "Nothing wrong · skip to Ship". */
export async function skipToShip(number: string): Promise<ActionResult> {
  const t = await loadForStep(number, "inspect");
  if (!t.ok) return t;
  const { error } = await t.supabase.rpc("skip_to_ship", { p_ticket: t.id });
  if (error) return { ok: false, error: message(error) };
  await drainQuietly(t.id);
  refresh(number);
  return { ok: true };
}

/** Closed → Ship, owners and admins only (the database checks too). */
export async function reopenTicket(number: string): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  if (t.stage !== "closed") return { ok: false, error: "Only a closed ticket can be reopened." };
  if (!isAdminOf(t.grants, t.workspace_id)) return { ok: false, error: "Reopen is for owners and admins." };
  const { error } = await t.supabase.rpc("reopen", { p_ticket: t.id });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- messages: Slack and email */

/**
 * Customer emails are logged, never sent, until the sheet's addresses are
 * scrubbed and a mailer exists. One row per kind per ticket.
 */
async function logEmail(t: Loaded, kind: "received" | "shipped") {
  const { data: ticket } = await t.supabase.from("tickets").select("customer_name, customer_email, watch, ship_tracking, ship_carrier").eq("id", t.id).single();
  if (!ticket?.customer_email) return;
  const { data: already } = await t.supabase.from("ticket_messages").select("id").eq("ticket_id", t.id).eq("channel", "email").eq("kind", kind).limit(1);
  if (already?.length) return;
  const first = ticket.customer_name.split(/\s+/)[0];
  const subject = kind === "received" ? "We received your watch" : "Your watch is on its way";
  const body =
    kind === "received"
      ? `Hi ${first}, your ${ticket.watch} is on the bench. Ticket ${t.number}. We'll write again when it ships.`
      : `Hi ${first}, your ${ticket.watch} shipped today${ticket.ship_tracking ? ` · ${[ticket.ship_carrier, ticket.ship_tracking].filter(Boolean).join(" ")}` : ""}. Ticket ${t.number}.`;
  await t.supabase.from("ticket_messages").insert({ ticket_id: t.id, channel: "email", kind, recipient: ticket.customer_email, subject, body, status: "logged", created_by: t.userId });
}

export type SlackPostResult = ActionResult & { slack?: { ok: boolean; error?: string } };

/**
 * Post to the brand's Slack channel and record the row. Two kinds: a parts
 * list from Supply, or a cannot-replicate note from Inspect. A Slack failure
 * never undoes anything: the row is kept with status failed and the error.
 */
export async function postToSlack(number: string, kind: "parts_needed" | "cannot_replicate"): Promise<SlackPostResult> {
  const parsed = z.enum(["parts_needed", "cannot_replicate"]).safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown message." };
  const stage: Step = parsed.data === "parts_needed" ? "supply" : "inspect";
  const t = await loadForStep(number, stage);
  if (!t.ok) return t;
  const [{ data: ticket }, { data: steps }] = await Promise.all([
    t.supabase.from("tickets").select("customer_name, watch, issue").eq("id", t.id).single(),
    t.supabase.from("ticket_steps").select("stage, notes, answer").eq("ticket_id", t.id).in("stage", ["inspect", "supply"]),
  ]);
  const inspect = steps?.find((s) => s.stage === "inspect");
  const supply = steps?.find((s) => s.stage === "supply");
  if (parsed.data === "parts_needed" && !supply?.notes?.trim()) return { ok: false, error: "List the parts you need first." };
  if (parsed.data === "cannot_replicate" && !inspect?.notes?.trim()) return { ok: false, error: "Add your inspection comments first." };

  const title = parsed.data === "parts_needed" ? "Parts needed" : "Cannot replicate reported issue";
  const head = `${title} · ${t.number} · ${ticket?.watch ?? ""} · ${ticket?.customer_name ?? ""}`;
  const link = `${appUrl()}/service-center/tickets/${t.number}`;
  const lines: string[] = [];
  if (parsed.data === "parts_needed") {
    lines.push(...(supply!.notes!.split("\n").map((l) => l.trim()).filter(Boolean)));
    if (inspect?.notes) lines.push(`Inspection: ${inspect.notes}`);
  } else {
    lines.push(`Reported: ${ticket?.issue ?? ""}`, `${t.userName.split(/\s+/)[0]}: ${inspect!.notes}`);
  }
  const body = [head, ...lines].join("\n");
  const slackText = [`*${mrkdwn(head)}*`, ...lines.map(mrkdwn), "", `Open the ticket: ${link}`].join("\n");
  const slack = await postSlack(slackText);

  const { error } = await t.supabase.from("ticket_messages").insert({
    ticket_id: t.id,
    channel: "slack",
    kind: parsed.data,
    body,
    status: slack.ok ? "sent" : "failed",
    external_id: slack.ok ? slack.ts : null,
    error: slack.ok ? null : slack.error,
    created_by: t.userId,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true, slack: slack.ok ? { ok: true } : { ok: false, error: slack.error } };
}

/* ---------------------------------------------------------------- test */

async function upsertTest(t: Loaded, kind: TestKind, result: "pass" | "fail", note: string | null) {
  const { data: ticket } = await t.supabase.from("tickets").select("test_attempt").eq("id", t.id).single();
  const attempt = ticket?.test_attempt ?? 1;
  const { data: existing } = await t.supabase.from("ticket_tests").select("id").eq("ticket_id", t.id).eq("attempt", attempt).eq("kind", kind).maybeSingle();
  return existing
    ? t.supabase.from("ticket_tests").update({ result, note, created_by: t.userId }).eq("id", existing.id)
    : t.supabase.from("ticket_tests").insert({ ticket_id: t.id, attempt, kind, result, note, created_by: t.userId });
}

const testKind = z.enum(TEST_KINDS);

export async function passTest(number: string, kind: TestKind): Promise<ActionResult> {
  const parsed = testKind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown check." };
  const t = await loadForStep(number, "test");
  if (!t.ok) return t;
  const { error } = await upsertTest(t, parsed.data, "pass", null);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Clear a pass (undo) for the current attempt. */
export async function clearTest(number: string, kind: TestKind): Promise<ActionResult> {
  const parsed = testKind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown check." };
  const t = await loadForStep(number, "test");
  if (!t.ok) return t;
  const { data: ticket } = await t.supabase.from("tickets").select("test_attempt").eq("id", t.id).single();
  const { error } = await t.supabase.from("ticket_tests").delete().eq("ticket_id", t.id).eq("attempt", ticket?.test_attempt ?? 1).eq("kind", parsed.data);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** Record the fail with its note, then send the watch back to Repair. The attempt counter bumps in send_back. */
export async function failTest(number: string, kind: TestKind, note: string): Promise<ActionResult> {
  const parsed = testKind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "Unknown check." };
  const t = await loadForStep(number, "test");
  if (!t.ok) return t;
  const text = note.trim().slice(0, 500) || null;
  const { error } = await upsertTest(t, parsed.data, "fail", text);
  if (error) return { ok: false, error: message(error) };
  const { error: e2 } = await t.supabase.rpc("send_back", { p_ticket: t.id, p_to: "repair" });
  if (e2) return { ok: false, error: message(e2) };
  await t.supabase.from("ticket_events").insert({
    ticket_id: t.id,
    type: "comment",
    actor_id: t.userId,
    body: `${TEST_LABELS[parsed.data]} check failed${text ? `: ${text.replace(/[.\s]+$/, "")}` : ""}. Back to Repair.`,
  });
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- payment */

const paymentInput = z.object({
  amount: z.number().nonnegative().max(100000).nullable(),
  invoiceSent: z.boolean(),
});

/** Cost and whether the invoice went out. Anyone who can edit the ticket. */
export async function setPayment(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = paymentInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the amount." };
  const t = await load(number);
  if (!t.ok) return t;
  if (!mayEdit(t)) return { ok: false, error: "Your role can't record payments." };
  const { data: cur } = await t.supabase.from("tickets").select("invoice_sent_at").eq("id", t.id).single();
  const { error } = await t.supabase
    .from("tickets")
    .update({ payment_amount: parsed.data.amount, invoice_sent_at: parsed.data.invoiceSent ? (cur?.invoice_sent_at ?? new Date().toISOString()) : null })
    .eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

/** "Payment received": the payment step's answer. Queues the sheet cell through the database trigger. */
export async function setPaymentReceived(number: string, received: boolean): Promise<ActionResult> {
  const t = await load(number);
  if (!t.ok) return t;
  if (!mayEdit(t)) return { ok: false, error: "Your role can't record payments." };
  const { error } = await t.supabase.from("ticket_steps").update({ answer: received }).eq("ticket_id", t.id).eq("stage", "payment");
  if (error) return { ok: false, error: message(error) };
  await drainQuietly(t.id);
  refresh(number);
  return { ok: true };
}

/* ---------------------------------------------------------------- ship */

const shipInput = z.object({
  carrier: optional,
  tracking: optional,
  labelUrl: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(500)).transform((v) => v || null),
});
export type ShipInput = { carrier: string; tracking: string; labelUrl: string };

/** Carrier, tracking and label on the ticket; autosaved from the Ship step. */
export async function saveShipping(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = shipInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the tracking." };
  const t = await loadForStep(number, "ship");
  if (!t.ok) return t;
  const { error } = await t.supabase
    .from("tickets")
    .update({ ship_carrier: parsed.data.carrier, ship_tracking: parsed.data.tracking, label_url: parsed.data.labelUrl })
    .eq("id", t.id);
  if (error) return { ok: false, error: message(error) };
  refresh(number);
  return { ok: true };
}

const addressOnly = z.object({ line1: optional, line2: optional, city: optional, state: optional, postal_code: optional, country: countryField });

/** Edit the customer's ship-to address from the Ship step. */
export async function updateShipTo(number: string, raw: unknown): Promise<ActionResult> {
  const parsed = addressOnly.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the address." };
  const t = await loadForStep(number, "ship");
  if (!t.ok) return t;
  const hasAddress = Object.values(parsed.data).some(Boolean);
  const { error } = await t.supabase.from("tickets").update({ ship_to: hasAddress ? parsed.data : null }).eq("id", t.id);
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
  if (!mayEdit(t)) return { ok: false, error: "Your role can't change the address." };
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
