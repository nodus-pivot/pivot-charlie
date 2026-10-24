"use client";

import type { ReactNode } from "react";
import { ArrowCounterClockwise, ChatCircle, CheckCircle, PencilSimple, SlackLogo, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * The handoff's Slack card: a header (Slack logo · "Posted to" · the
 * channel · "Posted <time> · <who>" on the right in green), the message
 * body (bold title · mono ticket number · watch · customer, then the
 * content, quoted notes behind a 2px rule), and a footer with the reply
 * count and the Edit list / Post again actions.
 */
export type SlackCardProps = {
  channel: string | null;
  /** "Oct 16 · 2:14 PM" */
  postedAt: string;
  by: string;
  /** "Parts needed" or "Cannot replicate reported issue". */
  title: string;
  number: string;
  watch: string;
  customer: string;
  /** Plain lines of the message (the parts list, or "Reported: …"). */
  lines: string[];
  /** The quoted line behind the rule, if any ("Inspection: …" or "Rane: …"). */
  quote: string | null;
  replies: number;
  /** The last reply's text, or a hint about what replies mean. */
  replyNote: string | null;
  /** Set when the post never reached Slack: the card shows why. */
  failed: string | null;
  /** Set when replies could not be read (missing scope, deleted post): the footer shows nothing about replies. */
  repliesError?: string | null;
  onEdit?: () => void;
  onRepost?: () => void;
  /** Edit the list inside the card: the lines become a textarea, the footer posts or cancels. */
  edit?: { value: string; onChange: (v: string) => void; onPost: () => void; onCancel: () => void; placeholder?: string };
  busy?: boolean;
};

export function SlackCard(p: SlackCardProps) {
  return (
    <div className={cn("overflow-hidden rounded-xs border bg-panel", p.failed ? "border-coral/60" : "border-rule")}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-rule px-4 py-3 text-[13px]">
        <SlackLogo size={18} className="shrink-0 text-gold" aria-hidden />
        <span className="text-ink-2">{p.failed ? "Not posted to" : "Posted to"}</span>
        <span className="font-mono text-ink">{p.channel ?? "Slack"}</span>
        {p.failed ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-coral"><WarningCircle size={14} aria-hidden /> {p.failed}</span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 text-green"><CheckCircle size={14} aria-hidden /> Posted {p.postedAt} · {p.by}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 py-3.5 text-[14px] leading-[1.55] text-ink">
        <div>
          <b className="font-semibold">{p.title}</b> · <span className="font-mono text-ink-2">{p.number}</span> · {p.watch} · {p.customer}
        </div>
        {p.edit ? (
          <textarea
            value={p.edit.value}
            onChange={(e) => p.edit!.onChange(e.target.value)}
            autoFocus
            rows={Math.max(3, p.edit.value.split("\n").length + 1)}
            placeholder={p.edit.placeholder}
            aria-label="Parts you need, one per line"
            className="w-full resize-y rounded-xs border border-gold bg-ground px-3 py-2 text-[14px] leading-[1.55] text-ink outline-none placeholder:text-ink-3"
          />
        ) : (
          p.lines.map((l, i) => (
            <div key={i} className="text-ink-2">{l}</div>
          ))
        )}
        {p.quote ? <div className="border-l-2 border-border-strong pl-3 text-ink-2">{p.quote}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3.5 border-t border-rule px-4 py-2.5 text-[13px] text-ink-3">
        {p.edit ? (
          <>
            <span>Posts the list again as a new message; the old one stays in Slack.</span>
            <span className="ml-auto flex items-center gap-3.5">
              <FooterAction onClick={p.edit.onCancel} disabled={p.busy}>Cancel</FooterAction>
              <button type="button" onClick={p.edit.onPost} disabled={p.busy || !p.edit.value.trim()} className="inline-flex items-center gap-1.5 rounded-xs border border-gold px-3 py-1.5 text-[13px] font-medium text-gold-light transition-colors hover:bg-gold/10 disabled:opacity-60">
                <ArrowCounterClockwise size={14} aria-hidden /> Post updated list
              </button>
            </span>
          </>
        ) : (
          <>
            {p.repliesError ? null : (
              <span className="inline-flex items-center gap-1.5"><ChatCircle size={14} aria-hidden /> {p.replies ? `${p.replies} repl${p.replies === 1 ? "y" : "ies"}` : "No replies yet"}</span>
            )}
            {!p.repliesError && p.replyNote ? <span className="truncate">{p.replyNote}</span> : null}
            <span className="ml-auto flex items-center gap-3.5">
              {p.onEdit ? <FooterAction onClick={p.onEdit} disabled={p.busy}><PencilSimple size={14} aria-hidden /> Edit list</FooterAction> : null}
              {p.onRepost ? <FooterAction onClick={p.onRepost} disabled={p.busy}><ArrowCounterClockwise size={14} aria-hidden /> Post again</FooterAction> : null}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function FooterAction({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1.5 text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
      {children}
    </button>
  );
}

/** Split a stored message body (title line, then content) back into the card's parts. */
export function parseSlackBody(body: string): { lines: string[]; quote: string | null } {
  const [, ...rest] = body.split("\n");
  const quoteIx = rest.findIndex((l) => /^(Inspection|Rane|[A-Z][a-z]+):\s/.test(l) && rest.indexOf(l) === rest.length - 1);
  if (quoteIx >= 0) return { lines: rest.slice(0, quoteIx), quote: rest[quoteIx] };
  return { lines: rest, quote: null };
}
