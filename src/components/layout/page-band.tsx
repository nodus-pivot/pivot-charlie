import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

/**
 * The photo band at the top of a module page: 200px, a photo slot (the panel
 * color until photography lands) under a top-to-bottom darkening, with the
 * eyebrow and a 60px Cormorant title set into the bottom-left and an action
 * on the right.
 */
export function PageBand({
  eyebrow,
  title,
  aside,
  action,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  /** Secondary line to the right of the title, e.g. "Contrail GMT · NW260004 · in Fix". */
  aside?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative h-[200px] flex-none overflow-hidden", className)}>
      <div aria-hidden className="absolute inset-0 bg-panel" />
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(14,26,38,.25), rgba(14,26,38,.96))" }} />
      <div className="absolute inset-x-4 bottom-[22px] flex items-end justify-between gap-6 sm:inset-x-8 lg:inset-x-12">
        <div className="flex min-w-0 flex-col gap-2.5">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="truncate font-display text-[44px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[60px]">
            {title}
          </h1>
        </div>
        {aside ? <div className="hidden shrink-0 text-base text-ink-2 sm:block">{aside}</div> : null}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}
