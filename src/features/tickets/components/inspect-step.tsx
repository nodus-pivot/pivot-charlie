"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { COMPONENTS, COMPONENT_LABELS, type Component } from "@/features/pipeline";
import { cn } from "@/lib/utils";
import { advanceTicket, removeFinding, saveStageNote, sendBack, setFinding } from "../actions";
import type { FitPart } from "../detail";
import { ComponentIcon } from "./component-icon";

type Condition = "worn" | "scratched" | "discolored" | "cracked";
const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "worn", label: "Worn" },
  { value: "scratched", label: "Scratched" },
  { value: "discolored", label: "Discolored" },
  { value: "cracked", label: "Cracked" },
];

export type FindingState = { component: Component; condition: Condition | null; action: "fix" | "replace"; partId: string | null };

type Props = {
  number: string;
  initial: FindingState[];
  fits: FitPart[];
  note: string;
  canAct: boolean;
};

/** S4: tap the parts with a problem; one row each with condition, plan and catalog part. Every Replace feeds Supply. */
export function InspectStep({ number, initial, fits, note, canAct }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<FindingState[]>(initial);
  const [text, setText] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const byComponent = new Map(rows.map((r) => [r.component, r]));
  const ordered = COMPONENTS.filter((c) => byComponent.has(c)).map((c) => byComponent.get(c)!);
  const missingParts = ordered.filter((r) => r.action === "replace" && !r.partId).map((r) => COMPONENT_LABELS[r.component]);

  function persist(next: FindingState) {
    save(async () => {
      const r = await setFinding(number, next);
      if (!r.ok) setError(r.error);
    });
  }

  function toggle(component: Component) {
    if (!canAct) return;
    setError(null);
    if (byComponent.has(component)) {
      setRows((rs) => rs.filter((r) => r.component !== component));
      save(async () => {
        const r = await removeFinding(number, component);
        if (!r.ok) setError(r.error);
      });
    } else {
      const next: FindingState = { component, condition: null, action: "fix", partId: null };
      setRows((rs) => [...rs, next]);
      persist(next);
    }
  }

  function update(component: Component, patch: Partial<FindingState>) {
    if (!canAct) return;
    setError(null);
    const current = byComponent.get(component);
    if (!current) return;
    let next = { ...current, ...patch };
    if (patch.action === "replace" && !next.partId) {
      const options = fits.filter((p) => p.component === component);
      if (options.length === 1) next = { ...next, partId: options[0].id };
    }
    if (next.action === "fix") next = { ...next, partId: null };
    setRows((rs) => rs.map((r) => (r.component === component ? next : r)));
    persist(next);
  }

  function done() {
    setError(null);
    start(async () => {
      const r = await advanceTicket(number, "supply");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function back() {
    setError(null);
    start(async () => {
      const r = await sendBack(number, "check_in");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] uppercase tracking-label text-ink-3">Tap what has a problem</span>
        {COMPONENTS.map((c) => {
          const on = byComponent.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              aria-pressed={on}
              disabled={!canAct}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 py-1.5 text-[13px] leading-none transition-colors disabled:opacity-100",
                on ? "border-gold-light bg-gold/12 text-gold-light" : "border-border-strong text-ink-2 hover:border-gold hover:text-ink",
              )}
            >
              <ComponentIcon component={c} size={13} />
              {COMPONENT_LABELS[c]}
            </button>
          );
        })}
      </div>

      {ordered.length ? (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[110px_1fr_170px_1fr] gap-4 border-b border-rule pb-2 text-[11px] uppercase tracking-label text-ink-3 lg:grid">
            <span>Part</span>
            <span>What you found</span>
            <span>Plan</span>
            <span>Catalog part</span>
          </div>
          {ordered.map((r) => {
            const options = fits.filter((p) => p.component === r.component);
            return (
              <div key={r.component} className="grid grid-cols-1 gap-3 border-b border-rule py-3.5 lg:grid-cols-[110px_1fr_170px_1fr] lg:items-center lg:gap-4">
                <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
                  {COMPONENT_LABELS[r.component]}
                  {canAct ? (
                    <button type="button" onClick={() => toggle(r.component)} className="text-ink-3 hover:text-coral" aria-label={`Remove ${COMPONENT_LABELS[r.component]}`}>
                      <X size={12} />
                    </button>
                  ) : null}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => update(r.component, { condition: r.condition === c.value ? null : c.value })}
                      aria-pressed={r.condition === c.value}
                      disabled={!canAct}
                      className={cn(
                        "whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs leading-none transition-colors disabled:opacity-100",
                        r.condition === c.value ? "border-gold-light bg-gold/12 text-gold-light" : "border-border-strong text-ink-3 hover:border-gold hover:text-ink-2",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div>
                  <Segmented
                    value={r.action}
                    options={[{ value: "fix", label: "Fix" }, { value: "replace", label: "Replace" }]}
                    onChange={(v) => update(r.component, { action: v })}
                    aria-label={`Plan for ${COMPONENT_LABELS[r.component]}`}
                  />
                </div>
                <div className="min-w-0 text-[15px]">
                  {r.action === "fix" ? (
                    <span className="text-ink-3">No part needed</span>
                  ) : options.length === 0 ? (
                    <span className="text-amber">No {COMPONENT_LABELS[r.component].toLowerCase()} part fits this watch yet</span>
                  ) : (
                    <select
                      value={r.partId ?? ""}
                      onChange={(e) => update(r.component, { partId: e.target.value || null })}
                      disabled={!canAct}
                      aria-label={`Catalog part for ${COMPONENT_LABELS[r.component]}`}
                      className={cn("w-full max-w-full bg-transparent outline-none [&>option]:bg-panel", r.partId ? "text-ink" : "text-gold-light")}
                    >
                      <option value="">Pick a part ▾</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.variant ? ` · ${p.variant}` : ""} — {p.sku}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Nothing tapped yet. If the watch only needs a regulation, tap Movement and leave it on Fix.</p>
      )}

      <label className="flex h-11 items-center border-b border-border-strong focus-within:border-gold">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => canAct && text !== note && save(async () => { const r = await saveStageNote(number, "inspect", text); if (!r.ok) setError(r.error); })}
          disabled={!canAct}
          placeholder="Anything else you noticed"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          aria-label="Inspect note"
        />
      </label>

      {canAct ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button variant="primary" disabled={pending || missingParts.length > 0} onClick={done}>
            Inspection done <ArrowRight size={14} /> Supply
          </Button>
          {missingParts.length ? (
            <span className="text-[13px] text-ink-3">
              <span className="text-amber">{missingParts.length} left:</span> pick a part for {missingParts.join(", ")}
            </span>
          ) : (
            <span className="text-[13px] text-ink-3">Replacements become the Supply list.</span>
          )}
          {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
          <button type="button" onClick={back} disabled={pending} className="ml-auto flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowUUpLeft size={13} /> Back to Check in
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">The watchmaker records what the inspection finds.</p>
      )}
    </>
  );
}
