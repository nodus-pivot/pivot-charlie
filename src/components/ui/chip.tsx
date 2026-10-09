import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "gold" | "amber" | "coral" | "green";

const tones: Record<ChipTone, string> = {
  neutral: "border-border-strong text-ink-3",
  gold: "border-gold-light bg-gold/12 text-gold-light",
  amber: "border-amber bg-amber/14 text-amber",
  coral: "border-coral bg-coral/14 text-coral",
  green: "border-green bg-green/14 text-green",
};

/** 999px pill, 12px text. Filters, badges and flags all use it. */
export function chipClasses(tone: ChipTone = "neutral", className?: string) {
  return cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs leading-none", tones[tone], className);
}

export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return <span className={chipClasses(tone, className)}>{children}</span>;
}

/** A chip that navigates, for filter rows. Active chips go gold. */
export function ChipLink({ active, className, ...props }: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={chipClasses(active ? "gold" : "neutral", cn("transition-colors hover:border-gold hover:text-ink-2", className))}
      {...props}
    />
  );
}
