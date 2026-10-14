"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, Check, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { COMPONENTS, COMPONENT_LABELS, type Component } from "@/features/pipeline";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { advanceTicket, markFindingDone, saveStageNote, sendBack, setBenchMinutes, setCoverage, setFinding, setFindingNote } from "../actions";
import type { FitPart } from "../detail";
import { ComponentIcon } from "./component-icon";

export type FixRow = {
  id: string;
  component: Component;
  action: "fix" | "replace";
  partId: string | null;
  partName: string | null;
  partSku: string | null;
  note: string;
  foundOnBench: boolean;
  doneAt: string | null;
};

type Props = {
  number: string;
  rows: FixRow[];
  fits: FitPart[];
  note: string;
  benchMinutes: number | null;
  coverage: "warranty" | "paid" | null;
  canAct: boolean;
};

/** S7: planned rows plus rows found on the bench; a note and Mark done per row; bench notes, time on bench, covered by. */
export function FixStep({ number, rows: initialRows, fits, note, benchMinutes, coverage, canAct }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [text, setText] = useState(note);
  const [hours, setHours] = useState(benchMinutes === null ? "" : String(Math.floor(benchMinutes / 60)));
  const [mins, setMins] = useState(benchMinutes === null ? "" : String(benchMinutes % 60));
  const [cover, setCover] = useState(coverage);
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const ordered = COMPONENTS.filter((c) => rows.some((r) => r.component === c)).map((c) => rows.find((r) => r.component === c)!);
  const left = ordered.filter((r) => !r.doneAt);
  const unused = COMPONENTS.filter((c) => !rows.some((r) => r.component === c));

  function patch(id: string, p: Partial<FixRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function toggleDone(r: FixRow) {
    const next = !r.doneAt;
    setError(null);
    patch(r.id, { doneAt: next ? new Date().toISOString() : null });
    save(async () => {
      const res = await markFindingDone(number, r.id, next);
      if (!res.ok) {
        patch(r.id, { doneAt: r.doneAt });
        setError(res.error);
      }
    });
  }

  function changePlan(r: FixRow, action: "fix" | "replace", partId?: string | null) {
    setError(null);
    const options = fits.filter((p) => p.component === r.component);
    const nextPart = action === "replace" ? (partId ?? r.partId ?? (options.length === 1 ? options[0].id : null)) : null;
    const part = fits.find((p) => p.id === nextPart);
    patch(r.id, { action, partId: nextPart, partName: part?.name ?? null, partSku: part?.sku ?? null });
    save(async () => {
      const res = await setFinding(number, { component: r.component, condition: null, action, partId: nextPart, note: r.note || null });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function addFound(component: Component) {
    setError(null);
    start(async () => {
      const res = await setFinding(number, { component, condition: null, action: "fix", partId: null, note: null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function saveTime() {
    const h = hours.trim() === "" ? 0 : Number(hours);
    const m = mins.trim() === "" ? 0 : Number(mins);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) {
      setError("Enter whole hours and minutes (0–59).");
      return;
    }
    const total = hours.trim() === "" && mins.trim() === "" ? null : h * 60 + m;
    if (total === benchMinutes) return;
    save(async () => {
      const res = await setBenchMinutes(number, total);
      if (!res.ok) setError(res.error);
    });
  }

  function done() {
    setError(null);
    start(async () => {
      const res = await advanceTicket(number, "test");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function back() {
    setError(null);
    start(async () => {
      const res = await sendBack(number, "supply");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <span className="text-[11px] uppercase tracking-label text-ink-3">
        Work <span className="ml-2 font-mono normal-case tracking-normal">{ordered.length - left.length} of {ordered.length} done</span>
      </span>

      {ordered.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing planned. Tap a component below if you found something on the bench, or go straight to Test.</p>
      ) : (
        <div className="flex flex-col">
          {ordered.map((r) => {
            const options = fits.filter((p) => p.component === r.component);
            return (
              <div key={r.id} className="grid grid-cols-1 gap-3 border-b border-rule py-3.5 lg:grid-cols-[110px_150px_1fr_200px_auto] lg:items-center lg:gap-4">
                <span className="flex flex-col">
                  <span className="text-[15px] font-medium text-ink">{COMPONENT_LABELS[r.component]}</span>
                  {r.foundOnBench ? <span className="text-[10px] uppercase tracking-label text-amber">Found on bench</span> : null}
                </span>
                <Segmented
                  value={r.action}
                  options={[{ value: "fix", label: "Fix" }, { value: "replace", label: "Replace" }]}
                  onChange={(v) => canAct && !r.doneAt && changePlan(r, v)}
                  aria-label={`Plan for ${COMPONENT_LABELS[r.component]}`}
                  className={cn("justify-self-start", r.doneAt && "opacity-60")}
                />
                <span className="min-w-0 text-[15px] text-ink-2">
                  {r.action === "replace" ? (
                    r.partId ? (
                      <>
                        {r.doneAt ? "Replaced" : "Replace"} · {r.partName} <span className="font-mono text-xs text-ink-3">{r.partSku}</span>
                      </>
                    ) : options.length ? (
                      <select
                        value=""
                        onChange={(e) => changePlan(r, "replace", e.target.value || null)}
                        disabled={!canAct}
                        aria-label={`Catalog part for ${COMPONENT_LABELS[r.component]}`}
                        className="bg-transparent text-[15px] text-gold-light outline-none [&>option]:bg-panel"
                      >
                        <option value="">Pick a part ▾</option>
                        {options.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.variant ? ` · ${p.variant}` : ""} — {p.sku}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-amber">No part in the catalog</span>
                    )
                  ) : (
                    <span className="text-ink-3">{r.doneAt ? "Fixed" : "Fix in place"}</span>
                  )}
                </span>
                <input
                  defaultValue={r.note}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v === r.note || !canAct) return;
                    patch(r.id, { note: v });
                    save(async () => { const res = await setFindingNote(number, r.id, v); if (!res.ok) setError(res.error); });
                  }}
                  disabled={!canAct}
                  placeholder="Note"
                  aria-label={`Note for ${COMPONENT_LABELS[r.component]}`}
                  className="h-8 w-full border-b border-border-strong bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
                />
                <span className="justify-self-start lg:justify-self-end">
                  {r.doneAt ? (
                    <button
                      type="button"
                      onClick={() => canAct && toggleDone(r)}
                      className="inline-flex h-[34px] items-center gap-2 rounded-xs border border-green px-3 text-[13px] text-green"
                      title={canAct ? "Click to undo" : undefined}
                    >
                      <Check size={13} /> Done · {formatDate(r.doneAt)}
                    </button>
                  ) : canAct ? (
                    <Button size="sm" variant="primary" onClick={() => toggleDone(r)}>Mark done</Button>
                  ) : (
                    <span className="text-[13px] text-ink-3">open</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canAct && unused.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] uppercase tracking-label text-ink-3">Found more?</span>
          {unused.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => addFound(c)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-border-strong px-3 py-1.5 text-[13px] leading-none text-ink-2 transition-colors hover:border-gold hover:text-ink"
            >
              <Plus size={11} /> <ComponentIcon component={c} size={12} /> {COMPONENT_LABELS[c]}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Bench notes</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => canAct && text !== note && save(async () => { const r = await saveStageNote(number, "fix", text); if (!r.ok) setError(r.error); })}
            disabled={!canAct}
            placeholder="Anything the next person should know"
            className="h-10 border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
          />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Time on bench <span className="normal-case tracking-normal">· optional</span></span>
          <span className="flex h-10 items-center gap-2 font-mono text-[15px] text-ink">
            <input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} onBlur={saveTime} disabled={!canAct} placeholder="0" inputMode="numeric" aria-label="Hours on bench" className="w-10 border-b border-border-strong bg-transparent text-right outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none" />
            <span className="text-ink-3">h</span>
            <input value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, "").slice(0, 2))} onBlur={saveTime} disabled={!canAct} placeholder="00" inputMode="numeric" aria-label="Minutes on bench" className="w-10 border-b border-border-strong bg-transparent text-right outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none" />
            <span className="text-ink-3">min</span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Covered by</span>
          <Segmented
            value={cover}
            options={[{ value: "warranty", label: "Warranty" }, { value: "paid", label: "Paid" }]}
            onChange={(v) => {
              if (!canAct) return;
              setCover(v);
              save(async () => { const r = await setCoverage(number, v); if (!r.ok) setError(r.error); else router.refresh(); });
            }}
            aria-label="Covered by"
          />
        </div>
      </div>

      {canAct ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button variant="primary" disabled={pending || left.length > 0} onClick={done}>
            Fix done <ArrowRight size={14} /> Test
          </Button>
          {left.length ? (
            <span className="text-[13px] text-ink-3">
              <span className="text-amber">{left.length} left:</span> {left.map((r) => COMPONENT_LABELS[r.component]).join(", ")}
            </span>
          ) : null}
          {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
          <button type="button" onClick={back} disabled={pending} className="ml-auto flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowUUpLeft size={13} /> Back to Supply
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">{left.length ? `${left.length} of ${ordered.length} still open on the bench.` : "All work is done; waiting for the watchmaker to move it to Test."}</p>
      )}
    </>
  );
}
