import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The gold kicker above every title: a 28px rule, then 11px uppercase text. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex items-center gap-3.5 font-sans text-[11px] uppercase tracking-eyebrow text-gold", className)}>
      <span aria-hidden className="h-px w-7 shrink-0 bg-gold" />
      {children}
    </span>
  );
}
