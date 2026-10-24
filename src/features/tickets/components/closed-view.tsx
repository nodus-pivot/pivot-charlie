"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Soon } from "@/components/ui/soon";
import { reopenTicket } from "../actions";
import type { ClosedRow } from "../summary";

/**
 * D10: the Summary block at the top of a closed ticket's rail: one line per
 * step, Export PDF (placeholder) and Reopen → Ship for owners and admins.
 * The folded step rows follow underneath in the rail itself.
 */
export function ClosedSummary({ number, rows, canReopen }: { number: string; rows: ClosedRow[]; canReopen: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reopen() {
    setError(null);
    start(async () => {
      const r = await reopenTicket(number);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 border-b border-rule pb-6 pt-[22px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">Summary</h2>
        <div className="flex items-center gap-2.5">
          <Soon hint="PDF export">Export PDF</Soon>
          {canReopen ? (
            confirm ? (
              <>
                <span className="text-[13px] text-ink-3">Back to Ship?</span>
                <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
                <Button variant="primary" disabled={pending} onClick={reopen}>{pending ? "Reopening…" : "Reopen"}</Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setConfirm(true)}>
                Reopen <ArrowRight size={14} aria-hidden /> Ship
              </Button>
            )
          ) : null}
        </div>
      </div>
      {error ? <p role="alert" className="text-[13px] text-coral">{error}</p> : null}
      <dl className="grid grid-cols-[110px_1fr] gap-x-5 gap-y-2.5 text-[14px] leading-[1.5] sm:grid-cols-[160px_1fr]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-ink-3">{r.label}</dt>
            <dd className="text-ink">{r.text}</dd>
          </div>
        ))}
      </dl>
      {!canReopen ? <p className="text-[12px] text-ink-3">Reopen is for owners and admins.</p> : null}
    </div>
  );
}
