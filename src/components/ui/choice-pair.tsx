"use client";

import type { ReactNode } from "react";
import { Circle, RadioButton } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type Choice = {
  title: ReactNode;
  hint?: ReactNode;
  /** The destructive option (cannot replicate) goes coral when picked. */
  tone?: "gold" | "coral";
};

/**
 * The handoff's either/or pair: two equal cards in a 2-column grid with a
 * 24px radio glyph, 17px title and 13px hint. The picked card gets a gold
 * (or coral) border and the panel fill; the other sits at 75% opacity.
 */
export function ChoicePair({
  value,
  onChange,
  yes,
  no,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  yes: Choice;
  no: Choice;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2.5 sm:grid-cols-2">
      <Card choice={yes} on={value === true} onPick={() => onChange(true)} disabled={disabled} />
      <Card choice={no} on={value === false} onPick={() => onChange(false)} disabled={disabled} />
    </div>
  );
}

function Card({ choice, on, onPick, disabled }: { choice: Choice; on: boolean; onPick: () => void; disabled?: boolean }) {
  const coral = choice.tone === "coral";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "flex items-center gap-3.5 rounded-xs border px-[18px] py-4 text-left transition-colors disabled:cursor-default",
        on ? (coral ? "border-coral bg-panel" : "border-gold bg-panel") : "border-border-strong opacity-75 hover:opacity-100",
      )}
    >
      {on ? (
        <RadioButton size={24} weight="fill" className={cn("shrink-0", coral ? "text-coral" : "text-gold")} />
      ) : (
        <Circle size={24} className="shrink-0 text-ink-3" />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-[17px] font-medium", on && coral ? "text-coral" : "text-ink")}>{choice.title}</span>
        {choice.hint ? <span className="text-[13px] text-ink-3">{choice.hint}</span> : null}
      </span>
    </button>
  );
}
