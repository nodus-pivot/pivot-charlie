import "server-only";

/**
 * The one Slack client. Posts to the single channel in SLACK_CHANNEL_ID as
 * the bot in SLACK_BOT_TOKEN. Never throws: callers log the outcome and
 * carry on, because a missed Slack message must not block a ticket.
 */

export type SlackResult = { ok: true; ts: string } | { ok: false; error: string };

export function slackConfig(): { configured: boolean; channel: string | null } {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = process.env.SLACK_CHANNEL_ID?.trim() || null;
  return { configured: !!token && !!channel, channel };
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

function friendly(code: string): string {
  switch (code) {
    case "not_in_channel":
      return "The bot isn't in that channel yet. In Slack, run /invite @<bot name> in the channel.";
    case "channel_not_found":
      return "Slack can't find that channel id. Check SLACK_CHANNEL_ID.";
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
      return "Slack rejected the bot token. Check SLACK_BOT_TOKEN.";
    case "missing_scope":
      return "The bot token lacks the chat:write scope.";
    default:
      return `Slack: ${code}`;
  }
}
