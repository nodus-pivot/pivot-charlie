"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Soon } from "@/components/ui/soon";
import { reopenTicket } from "../actions";
import type { ClosedRow } from "../summary";

/** S10: every step folded to its line; Export PDF greyed; Reopen for owners and admins. */
export function ClosedView({ number, rows, canReopen }: { number: string; rows: ClosedRow[]; canReopen: boolean }) {
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
    <section className="flex min-w-0 flex-1 flex-col px-4 pb-9 pt-7 sm:px-8 lg:pl-[52px] lg:pr-12">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
        <h2 className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">Closed</h2>
        <div className="flex items-center gap-2">
          <Soon size="sm" hint="PDF export">Export PDF</Soon>
          {canReopen ? (
            confirm ? (
              <>
                <span className="text-[13px] text-ink-3">Back to Ship?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={pending} onClick={reopen}>{pending ? "Reopening…" : "Reopen"}</Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setConfirm(true)}>Reopen · owner, admin</Button>
            )
          ) : (
            <span className="text-[13px] text-ink-3">Reopen is owner · admin only</span>
          )}
        </div>
      </div>
      {error ? <p role="alert" className="pb-2 text-[13px] text-coral">{error}</p> : null}
      <dl className="border-t border-gold">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[120px_1fr] gap-4 border-b border-rule py-3 text-[15px] sm:grid-cols-[150px_1fr]">
            <dt className="text-ink-3">{r.label}</dt>
            <dd className="text-ink-2">{r.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
