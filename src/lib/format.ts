/** Nodus works in Los Angeles; render every timestamp there until user time zones exist. */
export const APP_TZ = "America/Los_Angeles";

const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: APP_TZ });
const dateYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: APP_TZ });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: APP_TZ });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ });

/** "Sep 5", or "Sep 5, 2025" when not this year. */
export function formatDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() ? date.format(d) : dateYear.format(d);
}

/** "today, 8:50 AM" or "Sep 4, 2:02 PM". */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = dayKey.format(d) === dayKey.format(now) ? "today" : formatDate(iso, now);
  return `${day}, ${time.format(d)}`;
}

/** "6:01 PM" in the app time zone. */
export function formatTime(iso: string | Date): string {
  return time.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Whole days between two instants, never negative. */
export function daysBetween(from: string | Date, to: Date = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  return Math.max(0, Math.floor((to.getTime() - a.getTime()) / 86_400_000));
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return "—";
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`.trim() : `${min} min`;
}
