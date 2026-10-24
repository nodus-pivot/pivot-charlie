import "server-only";

/**
 * The one Slack client. Posts to the single channel in SLACK_CHANNEL_ID as
 * the bot in SLACK_BOT_TOKEN. Never throws: callers log the outcome and
 * carry on, because a missed Slack message must not block a ticket.
 */

export type SlackResult = { ok: true; ts: string } | { ok: false; error: string };

/** Absolute app origin for links in messages. */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "https://pivot-charlie.vercel.app";
}

/** Escape the three characters Slack's mrkdwn treats specially. */
export function mrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function slackConfig(): { configured: boolean; channel: string | null } {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_CHANNEL_ID?.trim() || null;
  return { configured: !!token && !!channel, channel };
}

/** "#nodus-service" for the Slack card: SLACK_CHANNEL_NAME when set, else the channel id. */
export function slackChannelName(): string | null {
  const name = process.env.SLACK_CHANNEL_NAME?.trim();
  if (name) return name.startsWith("#") ? name : `#${name}`;
  return process.env.SLACK_CHANNEL_ID?.trim() || null;
}

/** Plain text (mrkdwn) with optional Block Kit blocks. */
export async function postSlack(text: string, blocks?: unknown[]): Promise<SlackResult> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_CHANNEL_ID?.trim();
  if (!token || !channel) return { ok: false, error: "Slack is not configured (SLACK_BOT_TOKEN / SLACK_CHANNEL_ID)." };
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text, blocks, unfurl_links: false, unfurl_media: false }),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok: boolean; error?: string; ts?: string };
    if (!data.ok) return { ok: false, error: friendly(data.error ?? "unknown_error") };
    return { ok: true, ts: data.ts ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Slack did not answer." };
  }
}

export type SlackReplies = { ok: true; count: number; last: string | null } | { ok: false; error: string };

/**
 * Reply count and the newest reply under one of our posts. Needs the
 * channels:history (or groups:history) scope; the error says so when it
 * is missing, so the card can explain why replies don't show.
 */
export async function fetchSlackReplies(ts: string): Promise<SlackReplies> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_CHANNEL_ID?.trim();
  if (!token || !channel || !ts) return { ok: false, error: "Slack is not configured (SLACK_BOT_TOKEN / SLACK_CHANNEL_ID)." };
  try {
    const url = new URL("https://slack.com/api/conversations.replies");
    url.searchParams.set("channel", channel);
    url.searchParams.set("ts", ts);
    url.searchParams.set("limit", "200");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    const data = (await res.json()) as { ok: boolean; error?: string; messages?: { ts: string; text?: string; subtype?: string }[] };
    if (!data.ok || !data.messages) return { ok: false, error: friendly(data.error ?? "unknown_error", "replies") };
    const replies = data.messages.filter((m) => m.ts !== ts && !m.subtype);
    const last = replies.at(-1)?.text?.replace(/\s+/g, " ").trim() || null;
    return { ok: true, count: replies.length, last: last ? last.slice(0, 140) : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Slack did not answer." };
  }
}

function friendly(code: string, what: "post" | "replies" = "post"): string {
  switch (code) {
    case "thread_not_found":
    case "message_not_found":
      return "That post is no longer in Slack.";
    case "not_in_channel":
      return "The bot isn't in that channel yet. In Slack, run /invite @<bot name> in the channel.";
    case "channel_not_found":
      return "Slack can't find that channel id. Check SLACK_CHANNEL_ID.";
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
      return "Slack rejected the bot token. Check SLACK_BOT_TOKEN.";
    case "missing_scope":
      return what === "replies" ? "Reading replies needs the channels:history scope on the Slack app. Add it, reinstall the app, and update SLACK_BOT_TOKEN if it changed." : "The bot token lacks the chat:write scope.";
    default:
      return `Slack: ${code}`;
  }
}
