import type { ReactNode } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import type { StepRow } from "../summary";

/**
 * The right column: every step in order. Done steps fold to a title, a
 * check and their one-line summary; the current step opens under a gold
 * rule and holds its form; later steps are dim titles.
 */
export function StepRail({ steps, current, header, children }: { steps: StepRow[]; current?: { badge?: ReactNode; aside?: ReactNode }; header?: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col px-4 pb-9 pt-7 sm:px-8 lg:pl-[52px] lg:pr-12">
      {header}
      {steps.map((s) => (
        <div
          key={s.stage}
          className={cn("flex flex-col border-t", s.state === "current" ? "gap-[18px] border-gold pb-6 pt-[22px]" : "gap-4 border-rule py-3.5")}
          aria-current={s.state === "current" ? "step" : undefined}
        >
          <div className="flex items-baseline gap-3.5">
            <span
              className={cn(
                "flex items-center gap-3 font-display text-[30px] leading-none font-semibold tracking-[-0.02em]",
                s.state === "current" ? "text-ink" : s.state === "done" ? "text-ink-2" : "text-border-strong",
              )}
            >
              {s.label}
              {s.state === "done" ? <Check size={18} className="text-green" aria-label="done" /> : null}
              {s.state === "current" && current?.badge ? <span className="font-sans text-sm font-normal tracking-normal">{current.badge}</span> : null}
            </span>
            {s.state === "done" ? (
              <span className="ml-auto min-w-0 max-w-[460px] truncate text-right text-[13px] text-ink-3">
                {[s.date, s.summary].filter(Boolean).join(" · ")}
              </span>
            ) : s.state === "current" && current?.aside ? (
              <span className="ml-auto text-right text-[13px] text-ink-3">{current.aside}</span>
            ) : null}
          </div>
          {s.state === "current" ? children : null}
        </div>
      ))}
    </section>
  );
}
