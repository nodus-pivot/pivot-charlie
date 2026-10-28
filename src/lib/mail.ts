import "server-only";
import nodemailer from "nodemailer";

/**
 * The one mailer: Gmail over SMTP as the mailbox in MAIL_FROM with the app
 * password in MAIL_APP_PASSWORD. Works for a personal Gmail today and a
 * Workspace mailbox later with the same two values. Never throws: callers
 * record sent or failed on the ticket_messages row and carry on.
 */

export type MailResult = { ok: true; id: string | null } | { ok: false; error: string };

export function mailConfig(): { configured: boolean; enabled: boolean; from: string | null } {
  const from = process.env.MAIL_FROM?.trim() || null;
  const pass = process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const configured = !!from && !!pass;
  return { configured, enabled: configured && /^(1|true|yes|on)$/i.test(process.env.MAIL_ENABLED?.trim() ?? ""), from };
}

/** Customer emails go out only when MAIL_ENABLED is true; otherwise rows stay `logged`. The Ops test button ignores this. */
export function mailEnabled(): boolean {
  return mailConfig().enabled;
}

export async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; cid: string }[];
}): Promise<MailResult> {
  const from = process.env.MAIL_FROM?.trim();
  const pass = process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!from || !pass) return { ok: false, error: "Email is not configured (MAIL_FROM, MAIL_APP_PASSWORD)." };
  try {
    const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: from, pass } });
    const info = await transport.sendMail({
      from: { name: process.env.MAIL_FROM_NAME?.trim() || "Nodus Service Team", address: from },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
      attachments: msg.attachments,
    });
    return { ok: true, id: info.messageId ?? null };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) };
  }
}
