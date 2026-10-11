"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createWatch, updateWatch, type WatchInput } from "../actions";

type Values = { name: string; reference: string; warrantyMonths: string; movement: string; caseSpec: string; notes: string };

const EMPTY: Values = { name: "", reference: "", warrantyMonths: "24", movement: "", caseSpec: "", notes: "" };

/** New watch and Edit watch share this inline form. */
export function WatchForm({ brandId, watchId, initial, onClose }: { brandId: string; watchId?: string; initial?: Partial<Values>; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<Values>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  function submit() {
    setError(null);
    const input: WatchInput = { brandId, name: v.name, reference: v.reference, warrantyMonths: v.warrantyMonths, movement: v.movement, caseSpec: v.caseSpec, notes: v.notes };
    start(async () => {
      const r = watchId ? await updateWatch(watchId, input) : await createWatch(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      if (!watchId && r.id) router.push(`/ops/watches/${r.id}`);
      else router.refresh();
    });
  }

  const field = "h-10 w-full border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none";
  const label = "flex flex-col gap-1.5 text-[11px] uppercase tracking-label text-ink-3";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="grid gap-5 border border-rule bg-panel p-5 sm:grid-cols-2"
    >
      <label className={label}>Model<input value={v.name} onChange={set("name")} placeholder="Sector Deep" className={field} autoFocus required /></label>
      <label className={label}>Reference<input value={v.reference} onChange={set("reference")} placeholder="NW-SD-01" className={`${field} font-mono`} /></label>
      <label className={label}>Warranty · months<input value={v.warrantyMonths} onChange={set("warrantyMonths")} inputMode="numeric" placeholder="24" className={`${field} font-mono`} /></label>
      <label className={label}>Movement<input value={v.movement} onChange={set("movement")} placeholder="NH35" className={field} /></label>
      <label className={label}>Case<input value={v.caseSpec} onChange={set("caseSpec")} placeholder="40mm · steel" className={field} /></label>
      <label className={`${label} sm:col-span-2`}>Notes<input value={v.notes} onChange={set("notes")} placeholder="Ceramic insert only from 2025 on" className={field} /></label>
      {error ? <p role="alert" className="text-[13px] text-coral sm:col-span-2">{error}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button size="sm" variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" disabled={pending || !v.name.trim()}>{pending ? "Saving…" : watchId ? "Save" : "Add watch"}</Button>
      </div>
    </form>
  );
}
