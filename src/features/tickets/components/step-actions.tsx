"use client";

import type { ReactNode } from "react";
import { ArrowRight, ArrowUUpLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The row under every open step: the primary "<Done> → <Next>" button at
 * 60% while blocked with "N left: <reason>" beside it, any extra actions,
 * and "Back to <previous>" on the right.
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
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="primary" disabled={disabled} onClick={onPrimary} className={cn(disabled && !pending && "opacity-60")}>
        {pending ? "Saving…" : label}
        {next ? (
          <>
            <ArrowRight size={14} aria-hidden /> {next}
          </>
        ) : null}
      </Button>
      {blocked && note ? (
        <span className="min-w-0 flex-1 text-[13px] text-ink-3">{note}</span>
      ) : left.length ? (
        <span className="min-w-0 flex-1 text-[13px] text-ink-3">
          <span className="text-amber">{left.length} left:</span> {left.join(" · ")}
          {note ? <> · {note}</> : null}
        </span>
      ) : note ? (
        <span className="min-w-0 flex-1 text-[13px] text-ink-3">{note}</span>
      ) : null}
      {extra}
      {backLabel ? (
        <button type="button" disabled={pending} onClick={onBack} className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
          <ArrowUUpLeft size={13} aria-hidden /> Back to {backLabel}
        </button>
      ) : null}
    </div>
  );
}
