"use client";

import Link from "next/link";
import { useState } from "react";
import { Watch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Img } from "@/components/ui/photo";
import type { WatchListRow } from "../queries";
import { WatchForm } from "./watch-form";

/** O1, simplified: every model, its reference and warranty, and how many parts fit. */
export function WatchList({ rows, brandId, canEdit }: { rows: WatchListRow[]; brandId: string; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const active = rows.filter((r) => r.is_active);
  const retired = rows.filter((r) => !r.is_active);

  return (
    <section className="flex flex-col gap-6 px-4 pb-10 pt-7 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[620px] text-[15px] text-ink-2">Every model Nodus services. Open a watch to choose which parts fit it; that list is what the Replace picker offers on a ticket.</p>
        {canEdit && !adding ? <Button variant="primary" onClick={() => setAdding(true)}>New watch</Button> : null}
      </div>
      {adding ? <WatchForm brandId={brandId} onClose={() => setAdding(false)} /> : null}

      <div className="flex flex-col">
        <div className="hidden grid-cols-[72px_1fr_160px_120px_120px] gap-5 border-b border-rule pb-2 text-[11px] uppercase tracking-label text-ink-3 lg:grid">
          <span /><span>Model</span><span>Reference</span><span>Warranty</span><span>Fits</span>
        </div>
        {active.map((w) => <Row key={w.id} w={w} />)}
        {retired.length ? (
          <>
            <div className="pb-2 pt-7 text-[11px] uppercase tracking-label text-ink-3">Retired <span className="font-mono normal-case">{retired.length}</span></div>
            {retired.map((w) => <Row key={w.id} w={w} dim />)}
          </>
        ) : null}
        {rows.length === 0 ? <p className="py-8 text-sm text-ink-3">No models yet.</p> : null}
      </div>
    </section>
  );
}

function Row({ w, dim }: { w: WatchListRow; dim?: boolean }) {
  return (
    <Link
      href={`/ops/watches/${w.id}`}
      className={`grid grid-cols-[72px_1fr_auto] items-center gap-x-4 gap-y-1 border-t border-rule py-4 transition-colors hover:bg-panel/60 lg:grid-cols-[72px_1fr_160px_120px_120px] lg:gap-5 ${dim ? "opacity-50" : ""}`}
    >
      <span className="grid size-[72px] place-items-center overflow-hidden rounded-xs border border-rule bg-panel text-border-strong">{w.photo_path ? <Img path={w.photo_path} alt={w.name} className="size-full object-cover" /> : <Watch size={26} />}</span>
      <span className="flex flex-col">
        <span className="font-display text-[26px] leading-tight font-semibold text-ink">{w.name}</span>
        <span className="text-[13px] text-ink-3 lg:hidden">{[w.reference, w.warranty_months ? `${w.warranty_months} mo` : null, `${w.fits} parts`].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="hidden font-mono text-[13px] text-ink-2 lg:block">{w.reference ?? "—"}</span>
      <span className="hidden font-mono text-[13px] text-ink-2 lg:block">{w.warranty_months ? `${w.warranty_months} mo` : "—"}</span>
      <span className="font-mono text-[13px] text-ink-2">{w.fits} parts</span>
    </Link>
  );
}
