"use client";

import { COUNTRIES, isCountryCode } from "@/lib/country";
import { cn } from "@/lib/utils";

/**
 * Country as a dropdown of names, stored as the ISO code. A value that
 * isn't a code (an unrecognised string from the sheet) is shown as an
 * extra option so nothing is silently lost until someone picks.
 */
export function CountrySelect({ value, onChange, disabled, className, name, "aria-label": ariaLabel }: {
  value: string;
  onChange?: (code: string) => void;
  disabled?: boolean;
  className?: string;
  name?: string;
  "aria-label"?: string;
}) {
  const unknown = value && !isCountryCode(value) ? value : null;
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel ?? "Country"}
      className={cn("bg-transparent outline-none [&>option]:bg-panel", unknown && "text-amber", className)}
    >
      {unknown ? <option value={unknown}>{unknown} (pick a country)</option> : null}
      {!value ? <option value="">Country</option> : null}
      {COUNTRIES.map((c) => (
        // Node and the browser ship slightly different ICU spellings; the code is what matters.
        <option key={c.code} value={c.code} suppressHydrationWarning>{c.name}</option>
      ))}
    </select>
  );
}
