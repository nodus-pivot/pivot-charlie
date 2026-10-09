"use client";

import { cn } from "@/lib/utils";

/** Have it / Need it, Warranty / Paid, Fix / Replace: a 1px frame, the active segment lifted in gold. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "md" | "sm";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex shrink-0 gap-0.5 rounded-xs border border-border-strong p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "whitespace-nowrap rounded-[1px] transition-colors",
              size === "md" ? "px-[11px] py-[5px] text-[13px]" : "px-2 py-1 text-xs",
              active ? "bg-gold/12 text-gold-light" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/** A flag chip that toggles: Priority, Needs payment, Return to Everett. */
export function ToggleChip({ on, onChange, children, tone = "gold" }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; tone?: "gold" | "coral" }) {
  const active = tone === "coral" ? "border-coral bg-coral/14 text-coral" : "border-gold-light bg-gold/12 text-gold-light";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs leading-none transition-colors", on ? active : "border-border-strong text-ink-3 hover:border-gold hover:text-ink-2")}
    >
      {children}
    </button>
  );
}
