"use client";

import type { ReactNode } from "react";
import { ArrowRight, ArrowUUpLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The row under every open step. "Back to <previous>" on the left; on the
 * right, in reading order, "N left: <reason>", any extra forward action
 * (skip to Ship, owner override) and the primary "<Done> → <Next>" button
 * at 60% while blocked. Forward is always on the right.
 */
export function StepActions({
  label,
  next,
  onPrimary,
  blocked,
  left,
  note,
  pending,
  extra,
  backLabel,
  onBack,
  canAct,
  waitingText,
}: {
  label: string;
  next: string | null;
  onPrimary: () => void;
  /** Blocked for a reason the "left" list cannot name (e.g. parked). */
  blocked?: boolean;
  /** What still stands between here and the next step. */
  left: string[];
  /** Shown when nothing is left, or instead of the left list while blocked. */
  note?: ReactNode;
  pending: boolean;
  extra?: ReactNode;
  backLabel: string | null;
  onBack: () => void;
  canAct: boolean;
  /** What a viewer who cannot act sees instead of the buttons. */
  waitingText?: string;
}) {
  if (!canAct) return <p className="text-[13px] text-ink-3">{waitingText ?? "Waiting for the bench."}</p>;
  const disabled = pending || blocked || left.length > 0;
  const status = blocked && note ? (
    <span className="min-w-0 flex-1 text-[13px] text-ink-3 sm:text-right">{note}</span>
  ) : left.length ? (
    <span className="min-w-0 flex-1 text-[13px] text-ink-3 sm:text-right">
      <span className="text-amber">{left.length} left:</span> {left.join(" · ")}
      {note ? <> · {note}</> : null}
    </span>
  ) : note ? (
    <span className="min-w-0 flex-1 text-[13px] text-ink-3 sm:text-right">{note}</span>
  ) : null;
  // Back on the left, forward on the right: the row reads in the direction the ticket moves.
  return (
    <div className="flex items-start gap-4">
      {backLabel ? (
        <button type="button" disabled={pending} onClick={onBack} className="inline-flex shrink-0 items-center gap-1.5 self-center text-[13px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
          <ArrowUUpLeft size={13} aria-hidden /> Back to {backLabel}
        </button>
      ) : null}
      <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {status}
        {extra}
        <Button variant="primary" disabled={disabled} onClick={onPrimary} className={cn("shrink-0", disabled && !pending && "opacity-60")}>
          {pending ? "Saving…" : label}
          {next ? (
            <>
              <ArrowRight size={14} aria-hidden /> {next}
            </>
          ) : null}
        </Button>
      </div>
    </div>
  );
}
