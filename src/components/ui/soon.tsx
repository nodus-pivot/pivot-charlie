import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ButtonSize } from "./button";

/**
 * The one look for an affordance that exists in the design but not yet in
 * the product (Export PDF, ShipStation labels, dictation). Button-shaped,
 * dashed, dim, with a small "soon" tag and the integration's name on hover.
 * Never focusable, never clickable, so it can't be mistaken for broken.
 */
export function Soon({ children, hint, size = "md", className }: { children: ReactNode; hint: string; size?: ButtonSize; className?: string }) {
  return (
    <span
      role="button"
      aria-disabled="true"
      tabIndex={-1}
      title={`${hint} · coming soon`}
      className={cn(
        "inline-flex cursor-default select-none items-center justify-center gap-2 whitespace-nowrap rounded-xs border border-dashed border-border-strong font-sans font-medium text-ink-3 opacity-80",
        size === "md" ? "h-[42px] px-[18px] text-sm" : "h-[34px] px-3 text-[13px]",
        className,
      )}
    >
      {children}
      <SoonTag />
    </span>
  );
}

/** An icon-only placeholder: the mic next to the comment box. */
export function SoonIcon({ children, hint, className }: { children: ReactNode; hint: string; className?: string }) {
  return (
    <span aria-hidden title={`${hint} · coming soon`} className={cn("inline-flex cursor-default items-center text-ink-3/60", className)}>
      {children}
    </span>
  );
}

function SoonTag() {
  return <span className="rounded-pill border border-rule px-1.5 py-px text-[9px] uppercase leading-none tracking-label text-ink-3">soon</span>;
}
