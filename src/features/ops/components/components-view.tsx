"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Combobox } from "@/components/ui/combobox";
import { Eyebrow } from "@/components/ui/eyebrow";
import { COMPONENTS, COMPONENT_LABELS, type Component } from "@/features/pipeline";
import { ComponentIcon } from "@/features/tickets/components/component-icon";
import { cn } from "@/lib/utils";
import { setPartActive, setWatchPart } from "../actions";
import type { PartRow } from "../queries";
import { PartForm } from "./part-form";

type Props = {
  parts: PartRow[];
  watches: { id: string; name: string; reference: string | null }[];
  brandId: string;
  selectedType: Component;
  selectedPartId: string | null;
  canEdit: boolean;
};

/** O3, simplified: component types → parts → the part and which watches it fits. */
export function ComponentsView({ parts, watches, brandId, selectedType, selectedPartId, canEdit }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const m = new Map<Component, number>();
    for (const p of parts) if (p.is_active) m.set(p.component, (m.get(p.component) ?? 0) + 1);
    return m;
  }, [parts]);

  const q = query.trim().toLowerCase();
  const inType = parts.filter((p) => (q ? `${p.name} ${p.sku} ${p.variant ?? ""}`.toLowerCase().includes(q) : p.component === selectedType));
  const selected = parts.find((p) => p.id === selectedPartId) ?? null;

  const href = (type: Component, part?: string | null) => `/ops/components?type=${type}${part ? `&part=${part}` : ""}`;

  function toggleFit(watchId: string, fits: boolean) {
    if (!selected || !canEdit) return;
    setError(null);
    save(async () => {
      const r = await setWatchPart(watchId, selected.id, fits);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function retire(active: boolean) {
    if (!selected) return;
    setError(null);
    start(async () => {
      const r = await setPartActive(selected.id, active);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmRetire(false);
      router.refresh();
    });
  }

  const watchOptions = selected ? watches.filter((w) => !selected.fits.some((f) => f.id === w.id)).map((w) => ({ value: w.id, label: w.name, hint: w.reference ?? undefined })) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh_-_5.625rem)] lg:flex-none lg:flex-row">
      {/* ---------------------------------------------------------------- types */}
      <aside className="flex w-full flex-none flex-col border-b border-rule bg-panel lg:min-h-0 lg:w-[300px] lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-4 px-5 pb-4 pt-7">
          <Eyebrow>Ops · Components</Eyebrow>
          <label className="flex h-9 items-center gap-2 border-b border-border-strong text-[13px] text-ink-3 focus-within:border-gold">
            <MagnifyingGlass size={14} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parts" className="w-full bg-transparent text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none" aria-label="Search parts" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-3 hover:text-ink"><X size={12} /></button> : null}
          </label>
        </div>
        <ul className="flex min-h-0 flex-col overflow-y-auto lg:flex-1">
          {COMPONENTS.map((c) => {
            const on = !q && c === selectedType;
            return (
              <li key={c}>
                <Link
                  href={href(c)}
                  aria-current={on ? "true" : undefined}
                  className={cn("flex items-center gap-3 px-5 py-2.5 text-[15px] transition-colors hover:bg-ground/40", on ? "border-l-2 border-l-gold bg-gold/12 pl-[18px] text-ink" : "text-ink-2")}
                >
                  <ComponentIcon component={c} size={15} className={on ? "text-gold-light" : "text-ink-3"} />
                  <span className="flex-1">{COMPONENT_LABELS[c]}</span>
                  <span className="font-mono text-xs text-ink-3">{counts.get(c) ?? 0}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {canEdit ? (
          <div className="border-t border-rule px-5 py-3.5">
            <Button variant="primary" size="sm" onClick={() => { setAdding(true); setEditing(false); }}>New part</Button>
          </div>
        ) : null}
      </aside>

      {/* ---------------------------------------------------------------- parts of the type */}
      <section className="flex w-full flex-none flex-col border-b border-rule lg:min-h-0 lg:w-[340px] lg:border-b-0 lg:border-r">
        <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-7">
          <h2 className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">{q ? "Search" : COMPONENT_LABELS[selectedType]}</h2>
          <span className="font-mono text-xs text-ink-3">{inType.length} part{inType.length === 1 ? "" : "s"}</span>
        </div>
        <ul className="flex min-h-0 flex-col overflow-y-auto lg:flex-1">
          {inType.length === 0 ? <li className="px-5 py-6 text-sm text-ink-3">{q ? "Nothing matches." : "No parts of this type yet."}</li> : null}
          {inType.map((p) => {
            const on = p.id === selectedPartId;
            return (
              <li key={p.id}>
                <Link
                  href={href(p.component, p.id)}
                  aria-current={on ? "true" : undefined}
                  className={cn("flex flex-col gap-0.5 border-t border-rule px-5 py-3.5 transition-colors hover:bg-panel/60", on && "border-l-2 border-l-gold bg-gold/12 pl-[18px]", !p.is_active && "opacity-50")}
                >
                  <span className="text-[15px] text-ink">{p.name}{p.variant ? <span className="text-ink-3"> · {p.variant}</span> : null}</span>
                  <span className="font-mono text-xs text-ink-3">{p.sku}{q ? ` · ${COMPONENT_LABELS[p.component]}` : ""}{!p.is_active ? " · retired" : ""}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- the part */}
      <section className="flex min-w-0 flex-1 flex-col gap-6 px-4 pb-10 pt-7 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:px-12">
        {adding ? (
          <>
            <Eyebrow>New part</Eyebrow>
            <PartForm brandId={brandId} initial={{ component: selectedType }} onClose={(id, component) => { setAdding(false); if (id) router.push(href(component ?? selectedType, id)); }} />
          </>
        ) : !selected ? (
          <p className="my-auto max-w-[420px] text-sm text-ink-3">Pick a part on the left to see which watches it fits{canEdit ? ", or add a new one" : ""}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Eyebrow><span className="font-mono normal-case tracking-normal">{selected.sku}</span> · {COMPONENT_LABELS[selected.component]}</Eyebrow>
                <h1 className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] text-ink">{selected.name}</h1>
                <div className="flex items-center gap-2">
                  {selected.variant ? <Chip tone="gold">{selected.variant}</Chip> : null}
                  {!selected.is_active ? <Chip tone="neutral">retired</Chip> : null}
                </div>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => { setEditing(true); setAdding(false); }}>Edit</Button>
                  {selected.is_active ? (
                    confirmRetire ? (
                      <>
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
            </div>
            {error ? <p role="alert" className="text-[13px] text-coral">{error}</p> : null}

            {editing ? (
              <PartForm brandId={brandId} partId={selected.id} initial={{ component: selected.component, name: selected.name, sku: selected.sku, variant: selected.variant ?? "" }} onClose={() => setEditing(false)} />
            ) : null}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-label text-ink-3">Fits these watches</span>
                <span className="font-mono text-xs text-ink-3">{selected.fits.length}</span>
              </div>
              {selected.fits.length === 0 ? <p className="text-[13px] text-ink-3">Not linked to any watch yet, so the Replace picker won&rsquo;t offer it.</p> : null}
              <div className="flex flex-col">
                {selected.fits.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 border-b border-rule py-3 first:border-t">
                    <Link href={`/ops/watches/${w.id}`} className="flex-1 text-[15px] text-ink hover:text-gold-light">{w.name}</Link>
                    {canEdit ? (
                      <button type="button" onClick={() => toggleFit(w.id, false)} className="text-ink-3 hover:text-coral" aria-label={`Remove ${w.name}`}><X size={13} /></button>
                    ) : null}
                  </div>
                ))}
              </div>
              {canEdit ? (
                <Combobox
                  options={watchOptions}
                  onPick={(id) => toggleFit(id, true)}
                  placeholder={watchOptions.length ? "Add a watch this part fits…" : "Fits every watch already"}
                  disabled={watchOptions.length === 0}
                  aria-label="Add a watch this part fits"
                  className="max-w-[420px]"
                />
              ) : null}
            </div>
            <p className="text-[13px] text-ink-3">Stock isn&rsquo;t tracked. The watchmaker marks what&rsquo;s in hand on each ticket&rsquo;s Supply step.</p>
          </>
        )}
      </section>
    </div>
  );
}
