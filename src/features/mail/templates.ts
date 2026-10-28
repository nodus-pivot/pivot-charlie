/**
 * The four customer emails, rendered from a ticket snapshot. Pure: no
 * database, no network, so vitest can check the words. The HTML follows
 * the Nodus Service Center emails from Oct 2026: dark header with the
 * logo, ticket bar, white body with a 22px headline and a short rule,
 * grey boxes for quoted detail, black buttons, dark footer.
 *
 * Images are referenced by cid and attached by the sender (see send.ts).
 */

export type EmailKind = "received" | "tested" | "invoice" | "shipped";

export type TicketEmailData = {
  number: string;
  watch: string;
  customerName: string;
  /** The customer's words at intake (received). */
  issue?: string | null;
  /** The Repair step's "what you did" (invoice: "What this covers"). */
  repairNotes?: string | null;
  amount?: number | null;
  payUrl?: string | null;
  dueAt?: string | null;
  carrier?: string | null;
  tracking?: string | null;
  /** On a paid repair the testing email says a payment request follows. */
  needsPayment?: boolean;
  /** Pivot's public Check a repair page. */
  statusUrl: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

export const BRAND = {
  name: "Nodus",
  team: "Nodus Service Team",
  site: "https://noduswatches.com",
  siteLabel: "noduswatches.com",
  instagram: "https://www.instagram.com/noduswatches",
  facebook: "https://www.facebook.com/noduswatches",
};

/** cid names the HTML uses; send.ts attaches public/email/<file> under each. */
export const INLINE_IMAGES = [
  { cid: "nodus-logo", file: "nodus-logo.png" },
  { cid: "instagram", file: "instagram.png" },
  { cid: "facebook", file: "facebook.png" },
];

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  received: "Arrived",
  tested: "Testing passed",
  invoice: "Payment request",
  shipped: "Shipped",
};

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

/** Public tracking page for the three carriers Nodus uses; null when unknown. */
export function trackingUrl(carrier: string | null | undefined, tracking: string | null | undefined): string | null {
  const t = (tracking ?? "").replace(/\s+/g, "");
  if (!t) return null;
  const c = (carrier ?? "").toLowerCase();
  if (c.includes("usps") || /^(94|92|93|95|70|EA|EC|CP|RA)/i.test(t)) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;
  if (c.includes("ups") || /^1Z/i.test(t)) return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
  if (c.includes("fedex") || /^\d{12,15}$/.test(t)) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
  return null;
}

export function renderTicketEmail(kind: EmailKind, d: TicketEmailData): RenderedEmail {
  const first = firstName(d.customerName);
  const money = d.amount != null ? `$${d.amount.toFixed(2)}` : "";
  switch (kind) {
    case "received":
      return build({
        subject: `Your ${d.watch} has arrived and is in diagnostics — Ticket ${d.number}`,
        number: d.number,
        headline: `Your ${d.watch} has arrived and is now in diagnostics.`,
        greeting: `Hi ${first},`,
        lead: [`Your `, b(d.watch), ` has been received and logged into our service center. Our watchmaker is conducting a full diagnostic inspection — examining movement performance, gasket integrity, and the specific issue you flagged.`],
        box: d.issue?.trim() ? { label: "Issue flagged", text: clip(d.issue.trim(), 220) } : null,
        steps: [
          "Diagnostic inspection — our watchmaker examines every relevant component and documents findings.",
          "Repair — our watchmaker completes the necessary work.",
          "Testing & return — once repaired, we test thoroughly and ship it back to you.",
        ],
        close: "You will hear from us with an update as your watch moves through the process. If you have any questions in the meantime, reply directly to this email.",
        statusUrl: d.statusUrl,
      });
    case "tested":
      return build({
        subject: `Testing passed — your ${d.watch} will be sent home soon — Ticket ${d.number}`,
        number: d.number,
        headline: `Testing passed — your ${d.watch} will be sent home soon.`,
        greeting: `Hi ${first},`,
        lead: [`The repair and testing on your `, b(d.watch), ` are complete, and it’s ready to make its way back to you.`],
        close: d.needsPayment
          ? "A payment request for the repair follows in a separate email; once it’s paid we’ll ship right away and send your tracking information. If you have any questions in the meantime, just reply to this email."
          : "We’ll be in touch shortly with your tracking information once it ships. If you have any questions in the meantime, just reply to this email.",
        statusUrl: d.statusUrl,
      });
    case "invoice":
      return build({
        subject: `Payment request for your ${d.watch} repair — Ticket ${d.number}`,
        number: d.number,
        headline: `Payment needed for your ${d.watch}`,
        greeting: `Hi ${first},`,
        lead: [`Your repair comes to `, b(money), `. You can pay securely below and we’ll ship your `, d.watch, ` back right away.`, d.dueAt ? ` The link is good until ${longDate(d.dueAt)}.` : ""],
        box: d.repairNotes?.trim() ? { label: "What this covers", text: clip(d.repairNotes.trim(), 300) } : null,
        button: d.payUrl ? { label: "Pay now  →", url: d.payUrl } : null,
        close: "Once paid, we’ll have it on its way to you and send your tracking information. If you have any questions in the meantime, just reply to this email.",
        statusUrl: d.statusUrl,
      });
    case "shipped": {
      const track = trackingUrl(d.carrier, d.tracking);
      const number = (d.tracking ?? "").trim();
      return build({
        subject: `Your ${d.watch} has shipped — Ticket ${d.number}`,
        number: d.number,
        headline: `Your ${d.watch} has shipped.`,
        greeting: `Hi ${first},`,
        lead: [`Your `, b(d.watch), ` has shipped and is headed back to you.`, number ? " Use the tracking number below to follow its progress." : ""],
        box: number ? { label: [d.carrier?.trim(), "Tracking number"].filter(Boolean).join(" · "), text: number, mono: true } : null,
        button: track ? { label: "Track your package", url: track } : null,
        close: "Thank you for trusting us with your watch. If you have any questions about your repair or shipment, just reply to this email.",
        statusUrl: d.statusUrl,
      });
    }
  }
}

/* ---------------------------------------------------------------- shell */

type Inline = string | { b: string };
function b(text: string): Inline {
  return { b: text };
}

type Spec = {
  subject: string;
  number: string;
  headline: string;
  greeting: string;
  lead: Inline[];
  box?: { label: string; text: string; mono?: boolean } | null;
  steps?: string[];
  button?: { label: string; url: string } | null;
  close: string;
  statusUrl: string;
};

const FONT = "'Aktiv Grotesk',Helvetica,Arial,sans-serif";

function build(s: Spec): RenderedEmail {
  const leadHtml = s.lead.map((p) => (typeof p === "string" ? esc(p) : `<strong>${esc(p.b)}</strong>`)).join("");
  const leadText = s.lead.map((p) => (typeof p === "string" ? p : p.b)).join("");

  const boxHtml = s.box
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tbody><tr><td style="background:#f8f8f6;border-left:3px solid #1a1a1a;padding:14px 18px"><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:6px">${esc(s.box.label)}</div><div style="font-size:${s.box.mono ? "15px;font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:0.04em" : "13px"};color:#333;line-height:1.6">${esc(s.box.text)}</div></td></tr></tbody></table>`
    : "";
  const stepsHtml = s.steps?.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tbody><tr><td style="padding-bottom:10px"><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:14px">What happens next</div></td></tr>` +
      s.steps
        .map(
          (t, i) =>
            `<tr><td style="padding:0 0 ${i === s.steps!.length - 1 ? 0 : 12}px 0"><table width="100%" cellpadding="0" cellspacing="0"><tbody><tr><td style="width:28px;vertical-align:top;padding-top:1px"><div style="width:20px;height:20px;background:#1a1a1a;border-radius:50%;text-align:center;line-height:20px;font-size:10px;color:#fff;font-family:${FONT}">${i + 1}</div></td><td style="font-size:13px;color:#333;line-height:1.6;padding-left:10px">${esc(t)}</td></tr></tbody></table></td></tr>`,
        )
        .join("") +
      `</tbody></table>`
    : "";
  const buttonHtml = s.button
    ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 28px"><tbody><tr><td style="background:#1a1a1a;padding:14px 32px"><a href="${attr(s.button.url)}" style="font-family:${FONT};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#ffffff;text-decoration:none;font-weight:500" target="_blank">${esc(s.button.label)}</a></td></tr></tbody></table>`
    : "";

  const html = `<div style="margin:0;padding:0;background:#f4f4f0;font-family:${FONT}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 0"><tbody><tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%"><tbody>
      <tr><td style="background:#1a1a1a;padding:32px 40px 24px;text-align:center">
        <img src="cid:nodus-logo" alt="${esc(BRAND.name)}" width="160" style="display:block;margin:0 auto;width:160px;height:auto">
        <div style="font-family:${FONT};font-size:10px;letter-spacing:0.2em;color:#888888;text-transform:uppercase;margin-top:10px">Service Center</div>
      </td></tr>
      <tr><td style="background:#2a2a2a;padding:12px 40px;text-align:center;border-top:1px solid #3a3a3a">
        <span style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#999999">Service Ticket</span>
        <span style="font-family:${FONT};font-size:13px;letter-spacing:0.08em;color:#ffffff;margin-left:10px">${esc(s.number)}</span>
      </td></tr>
      <tr><td style="background:#ffffff;padding:40px 40px 32px;font-family:${FONT}">
        <p style="font-family:${FONT};font-size:22px;color:#1a1a1a;margin:0 0 6px;letter-spacing:0.02em">${esc(s.headline)}</p>
        <div style="width:40px;height:2px;background:#1a1a1a;margin:0 0 28px"></div>
        <p style="font-size:14px;color:#333;margin:0 0 20px">${esc(s.greeting)}</p>
        <p style="font-size:14px;color:#333;line-height:1.75;margin:0 0 24px">${leadHtml}</p>
        ${boxHtml}${stepsHtml}${buttonHtml}
        <p style="font-size:13px;color:#666;line-height:1.7;margin:0 0 28px">${esc(s.close)}</p>
        <p style="font-size:14px;color:#1a1a1a;margin:0">— ${esc(BRAND.team)}</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:0 40px 32px;text-align:center">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tbody><tr><td style="background:#1a1a1a;padding:14px 32px">
          <a href="${attr(s.statusUrl)}" style="font-family:${FONT};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#ffffff;text-decoration:none;font-weight:500" target="_blank">Check your service status  →</a>
        </td></tr></tbody></table>
      </td></tr>
      <tr><td style="background:#1a1a1a;padding:22px 40px 10px;text-align:center">
        <a href="${BRAND.instagram}" style="display:inline-block;margin:0 8px" target="_blank"><img src="cid:instagram" width="22" height="22" alt="Instagram" style="display:inline-block;vertical-align:middle;border:0"></a>
        <a href="${BRAND.facebook}" style="display:inline-block;margin:0 8px" target="_blank"><img src="cid:facebook" width="22" height="22" alt="Facebook" style="display:inline-block;vertical-align:middle;border:0"></a>
      </td></tr>
      <tr><td style="background:#1a1a1a;padding:10px 40px 24px;text-align:center">
        <div style="font-family:${FONT};font-size:11px;color:#666666;letter-spacing:0.05em"><a href="${BRAND.site}" style="color:#999999;text-decoration:underline" target="_blank">${esc(BRAND.siteLabel)}</a></div>
      </td></tr>
    </tbody></table>
  </td></tr></tbody></table>
</div>`;

  const text = [
    `${BRAND.name} Service Center · Service Ticket ${s.number}`,
    "",
    s.headline,
    "",
    s.greeting,
    "",
    leadText,
    s.box ? `\n${s.box.label}\n${s.box.text}` : "",
    s.steps?.length ? `\nWhat happens next\n${s.steps.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : "",
    s.button ? `\n${s.button.label.replace(/\s+→$/, "")}: ${s.button.url}` : "",
    "",
    s.close,
    "",
    `— ${BRAND.team}`,
    `Check your service status: ${s.statusUrl}`,
    BRAND.siteLabel,
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { subject: s.subject, text, html };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function attr(s: string): string {
  return esc(s);
}
function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}
function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(iso));
}
