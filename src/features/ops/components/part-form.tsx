"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { COMPONENTS, COMPONENT_LABELS, type Component } from "@/features/pipeline";
import { createPart, updatePart, type PartInput } from "../actions";

type Values = { component: Component; name: string; sku: string; variant: string };

/** New part and Edit part share this inline form. */
export function PartForm({ brandId, partId, initial, onClose }: { brandId: string; partId?: string; initial?: Partial<Values>; onClose: (id?: string, component?: Component) => void }) {
  const router = useRouter();
  const [v, setV] = useState<Values>({ component: "bezel", name: "", sku: "", variant: "", ...initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = "h-10 w-full border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none";
  const label = "flex flex-col gap-1.5 text-[11px] uppercase tracking-label text-ink-3";

  function submit() {
    setError(null);
    const input: PartInput = { brandId, component: v.component, name: v.name, sku: v.sku, variant: v.variant };
    start(async () => {
      const r = partId ? await updatePart(partId, input) : await createPart(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose(r.id, v.component);
      router.refresh();
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-5 border border-rule bg-panel p-5 sm:grid-cols-2">
      <label className={label}>
        Component
        <select value={v.component} onChange={(e) => setV((s) => ({ ...s, component: e.target.value as Component }))} className={`${field} [&>option]:bg-panel`}>
          {COMPONENTS.map((c) => (
            <option key={c} value={c}>{COMPONENT_LABELS[c]}</option>
          ))}
        </select>
      </label>
      <label className={label}>Name<input value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} placeholder="Bezel insert, Contrail" className={field} autoFocus required /></label>
      <label className={label}>SKU<input value={v.sku} onChange={(e) => setV((s) => ({ ...s, sku: e.target.value }))} placeholder="BZ-CT-01" className={`${field} font-mono uppercase`} required /></label>
      <label className={label}>Variant · optional<input value={v.variant} onChange={(e) => setV((s) => ({ ...s, variant: e.target.value }))} placeholder="Ceramic" className={field} /></label>
      {error ? <p role="alert" className="text-[13px] text-coral sm:col-span-2">{error}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => onClose()}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" disabled={pending || !v.name.trim() || !v.sku.trim()}>{pending ? "Saving…" : partId ? "Save" : "Add part"}</Button>
      </div>
    </form>
  );
}
