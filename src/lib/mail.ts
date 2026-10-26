import "server-only";
import nodemailer from "nodemailer";

/**
 * The one mailer: Gmail over SMTP as the mailbox in MAIL_FROM with the app
 * password in MAIL_APP_PASSWORD. Works for a personal Gmail today and a
 * Workspace mailbox later with the same two values. Never throws: callers
 * record sent or failed on the ticket_messages row and carry on.
 */

export type MailResult = { ok: true; id: string | null } | { ok: false; error: string };

export function mailConfig(): { configured: boolean; from: string | null } {
  const from = process.env.MAIL_FROM?.trim() || null;
  const pass = process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, "");
  return { configured: !!from && !!pass, from };
}

export async function sendMail(msg: { to: string; subject: string; text: string; html?: string; replyTo?: string }): Promise<MailResult> {
  const from = process.env.MAIL_FROM?.trim();
  const pass = process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!from || !pass) return { ok: false, error: "Email is not configured (MAIL_FROM, MAIL_APP_PASSWORD)." };
  try {
    const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: from, pass } });
    const info = await transport.sendMail({ from: { name: process.env.MAIL_FROM_NAME?.trim() || "Pivot", address: from }, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo });
    return { ok: true, id: info.messageId ?? null };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
  }
}
