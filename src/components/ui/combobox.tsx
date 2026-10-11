"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * Type to filter or click to open; arrow keys and Enter pick; Escape closes.
 * Picking calls onPick and clears the box, so it works as an "add one" control.
 */
export function Combobox({
  options,
  onPick,
  placeholder = "Type or pick…",
  disabled,
  emptyText = "Nothing matches",
  className,
  "aria-label": ariaLabel,
}: {
  options: ComboOption[];
  onPick: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Every typed word must appear somewhere in the label or hint, so "contrail cer" finds "Bezel insert, Contrail · Ceramic".
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? options.filter((o) => { const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) : options;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(value: string) {
    onPick(value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className={cn("flex h-9 items-center gap-2 border-b border-border-strong text-[14px] focus-within:border-gold", disabled && "opacity-50")}>
        <MagnifyingGlass size={14} className="shrink-0 text-ink-3" aria-hidden />
        <input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          onFocus={() => { setOpen(true); setActive(0); }}
          onClick={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open && shown[active]) pick(shown[active].value); }
            else if (e.key === "Escape") { setOpen(false); }
          }}
          className="w-full bg-transparent text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
        />
        <button type="button" tabIndex={-1} disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Open list" className="text-ink-3 hover:text-ink-2">
          <CaretDown size={12} />
        </button>
      </div>
      {open && !disabled ? (
        <ul id={id} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto border border-rule bg-panel py-1 text-[14px] shadow-none">
          {shown.length === 0 ? <li className="px-3 py-2 text-ink-3">{emptyText}</li> : null}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
              className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2", i === active ? "bg-gold/12 text-gold-light" : "text-ink-2")}
            >
              <span className="truncate">{o.label}</span>
              {o.hint ? <span className="shrink-0 font-mono text-xs text-ink-3">{o.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
