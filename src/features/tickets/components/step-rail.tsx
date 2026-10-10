import type { ReactNode } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import type { StepRow } from "../summary";

/**
 * The right column: every step in order. Done steps fold to a title, a
 * check and their one-line summary; the current step opens under a gold
 * rule and holds its form; later steps are dim titles.
 */
export function StepRail({ steps, children }: { steps: StepRow[]; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col px-4 pb-9 pt-7 sm:px-8 lg:pl-[52px] lg:pr-12">
      {steps.map((s) => (
        <div
          key={s.stage}
          className={cn("flex flex-col gap-4 border-t py-3.5", s.state === "current" ? "border-gold pb-6" : "border-rule")}
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
            </span>
            {s.state === "done" ? (
              <span className="ml-auto text-right text-[13px] text-ink-3">
                {[s.date, s.summary].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
          {s.state === "current" ? children : null}
        </div>
      ))}
    </section>
  );
}
