"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, X } from "@phosphor-icons/react";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { COMPONENT_LABELS } from "@/features/pipeline";
import { ComponentIcon } from "@/features/tickets/components/component-icon";
import { cn } from "@/lib/utils";
import { setWatchActive, setWatchPart } from "../actions";
import type { WatchDetail } from "../queries";
import { WatchForm } from "./watch-form";

/** O2, simplified: the model's facts on the left; on the right every catalog part grouped by component, tick to say it fits. */
export function WatchDetailView({ detail, canEdit }: { detail: WatchDetail; canEdit: boolean }) {
  const router = useRouter();
  const { watch } = detail;
  const [groups, setGroups] = useState(detail.groups);
  const [editing, setEditing] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const fitsCount = groups.reduce((n, g) => n + g.parts.filter((p) => p.fits).length, 0);

  function toggle(partId: string, fits: boolean) {
    if (!canEdit) return;
    setError(null);
    setGroups((gs) => gs.map((g) => ({ ...g, parts: g.parts.map((p) => (p.id === partId ? { ...p, fits } : p)) })));
    save(async () => {
      const r = await setWatchPart(watch.id, partId, fits);
      if (!r.ok) {
        setGroups((gs) => gs.map((g) => ({ ...g, parts: g.parts.map((p) => (p.id === partId ? { ...p, fits: !fits } : p)) })));
        setError(r.error);
      }
    });
  }

  function retire(active: boolean) {
    setError(null);
    start(async () => {
      const r = await setWatchActive(watch.id, active);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmRetire(false);
      router.refresh();
    });
  }

  const facts: [string, string | null][] = [
    ["Model", watch.name],
    ["Reference", watch.reference],
    ["Warranty", watch.warranty_months ? `${watch.warranty_months} months` : null],
    ["Movement", watch.movement],
    ["Case", watch.case_spec],
    ["Notes", watch.notes],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="flex w-full flex-none flex-col border-b border-rule px-4 pb-8 pt-8 sm:px-8 lg:w-[380px] lg:border-b-0 lg:border-r lg:pl-12 lg:pr-9">
        <Link href="/ops/watches" className="flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-3 hover:text-ink-2">
          <ArrowLeft size={12} /> Watches
        </Link>
        <div className="mt-5 flex flex-col">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1.5 border-t border-rule py-3.5">
              <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
              <span className={cn("text-base", label === "Reference" && "font-mono", value ? "text-ink" : "text-ink-3")}>{value ?? "—"}</span>
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
            <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
            {watch.is_active ? (
              confirmRetire ? (
                <>
                  <span className="text-[13px] text-ink-3">Hide from pickers?</span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRetire(false)}>Cancel</Button>
                  <Button size="sm" variant="primary" disabled={pending} onClick={() => retire(false)} className="border-coral text-coral hover:bg-coral/10">Retire</Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setConfirmRetire(true)}>Retire</Button>
              )
            ) : (
              <Button size="sm" variant="primary" disabled={pending} onClick={() => retire(true)}>Bring back</Button>
            )}
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-[13px] text-coral">{error}</p> : null}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-6 px-4 pb-10 pt-8 sm:px-8 lg:pl-[52px] lg:pr-12">
        {editing ? (
          <WatchForm
            brandId={watch.brand_id}
            watchId={watch.id}
            initial={{ name: watch.name, reference: watch.reference ?? "", warrantyMonths: watch.warranty_months?.toString() ?? "", movement: watch.movement ?? "", caseSpec: watch.case_spec ?? "", notes: watch.notes ?? "" }}
            onClose={() => setEditing(false)}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>Components that fit this watch</Eyebrow>
          <span className="text-[13px] text-ink-3">
            {canEdit ? "tick to add · " : ""}
            <Link href="/ops/components" className="text-gold-light hover:text-gold">Missing a part? Add it in Components</Link>
          </span>
        </div>
        {groups.length === 0 ? <p className="text-sm text-ink-3">No parts in the catalog yet.</p> : null}
        <div className="grid gap-x-14 gap-y-8 lg:grid-cols-2">
          {groups.map((g) => {
            const fitted = g.parts.filter((p) => p.fits);
            const available = g.parts.filter((p) => !p.fits).map((p) => ({ value: p.id, label: p.name + (p.variant ? ` · ${p.variant}` : ""), hint: p.sku }));
            return (
              <div key={g.component} className="flex flex-col">
                <div className="flex items-center gap-2.5 border-b border-rule pb-2.5">
                  <ComponentIcon component={g.component} size={16} className="text-ink-2" />
                  <span className="font-display text-[22px] font-semibold text-ink">{COMPONENT_LABELS[g.component]}</span>
                  <span className="font-mono text-xs text-ink-3">{fitted.length}</span>
                </div>
                {fitted.length === 0 ? <p className="py-3 text-[13px] text-ink-3">No {COMPONENT_LABELS[g.component].toLowerCase()} part fits yet.</p> : null}
                {fitted.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border-b border-rule py-3">
                    <span className="flex-1 text-[15px] text-ink">{p.name}{p.variant ? <span className="text-ink-3"> · {p.variant}</span> : null}</span>
                    <span className="font-mono text-xs text-ink-3">{p.sku}</span>
                    {canEdit ? (
                      <button type="button" onClick={() => toggle(p.id, false)} className="text-ink-3 hover:text-coral" aria-label={`Remove ${p.name}`}>
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                ))}
                {canEdit ? (
                  <Combobox
                    className="mt-2"
                    options={available}
                    onPick={(id) => toggle(id, true)}
                    placeholder={available.length ? `Add a ${COMPONENT_LABELS[g.component].toLowerCase()} part…` : "Every part of this type already fits"}
                    disabled={available.length === 0}
                    aria-label={`Add a ${COMPONENT_LABELS[g.component]} part`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-ink-3">{fitsCount} parts fit. Stock isn&rsquo;t tracked here; the watchmaker marks what&rsquo;s in hand on each ticket&rsquo;s Supply step.</p>
      </section>
    </div>
  );
}
