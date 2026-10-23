"use client";

import type { ReactNode } from "react";
import { CheckSquare, Square } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * The handoff's big tick row: a 26px check-square, a 17px label and a 13px
 * sub-line. Gold border and panel fill when on. One per step that is a
 * single yes: I have the watch, Parts received, Repair complete, Payment
 * received.
 */
export function BigTick({
  on,
  onToggle,
  label,
  hint,
  disabled,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  label: ReactNode;
  /** The 13px line under the label; may change with `on` (e.g. the time it was ticked). */
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-xs border px-[18px] py-4 text-left transition-colors disabled:cursor-default",
        on ? "border-gold bg-panel" : "border-border-strong hover:border-gold/60",
        className,
      )}
    >
      {on ? <CheckSquare size={26} weight="fill" className="shrink-0 text-gold" /> : <Square size={26} className="shrink-0 text-ink-3" />}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[17px] font-medium text-ink">{label}</span>
        {hint ? <span className="text-[13px] text-ink-3">{hint}</span> : null}
      </span>
    </button>
  );
}
