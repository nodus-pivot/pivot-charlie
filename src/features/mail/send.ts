import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mailEnabled, sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/slack";
import { INLINE_IMAGE_DATA } from "./images";
import { INLINE_IMAGES, renderTicketEmail, type EmailKind, type TicketEmailData } from "./templates";

type DB = SupabaseClient<Database>;

/**
 * One path for every customer email. The row is written first as
 * `logged`; when sending is on it goes out and the row becomes `sent`
 * (with Gmail's message id) or `failed` (with the reason). Nothing here
 * throws: a missed email never blocks a step.
 */
export async function sendTicketEmail(
  supabase: DB,
  ticketId: string,
  kind: EmailKind,
  to: string,
  data: TicketEmailData,
  by: string | null,
  opts: { oncePerTicket?: boolean } = {},
): Promise<{ status: "sent" | "failed" | "logged"; error?: string } | null> {
  if (opts.oncePerTicket) {
    const { data: already } = await supabase.from("ticket_messages").select("id").eq("ticket_id", ticketId).eq("channel", "email").eq("kind", kind).limit(1);
    if (already?.length) return null;
  }
  const rendered = renderTicketEmail(kind, data);
  const { data: row, error } = await supabase
    .from("ticket_messages")
    .insert({ ticket_id: ticketId, channel: "email", kind, recipient: to, subject: rendered.subject, body: rendered.text, status: "logged", created_by: by })
    .select("id")
    .single();
  if (error || !row) return { status: "failed", error: error?.message ?? "could not record the email" };
  if (!mailEnabled()) return { status: "logged" };
  return deliver(supabase, row.id, to, rendered);
}

/** Send a recorded email (again). Used by "Send again" on a failed row. */
export async function resendTicketEmail(supabase: DB, messageId: string, kind: EmailKind, to: string, data: TicketEmailData) {
  const rendered = renderTicketEmail(kind, data);
  await supabase.from("ticket_messages").update({ recipient: to, subject: rendered.subject, body: rendered.text }).eq("id", messageId);
  if (!mailEnabled()) return { status: "logged" as const };
  return deliver(supabase, messageId, to, rendered);
}

async function deliver(supabase: DB, messageId: string, to: string, rendered: { subject: string; text: string; html: string }) {
  const r = await sendMail({
    to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    attachments: INLINE_IMAGES.map((i) => ({ filename: i.file, content: Buffer.from(INLINE_IMAGE_DATA[i.cid], "base64"), cid: i.cid })),
  });
  await supabase
    .from("ticket_messages")
    .update(r.ok ? { status: "sent", external_id: r.id, error: null } : { status: "failed", error: r.error })
    .eq("id", messageId);
  return r.ok ? { status: "sent" as const } : { status: "failed" as const, error: r.error };
}

/** The public Check a repair page; the customer types the ticket number and email there. */
export function statusUrl(): string {
  return `${appUrl()}/status`;
}
