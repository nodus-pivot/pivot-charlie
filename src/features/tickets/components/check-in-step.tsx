"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, CheckSquare, CurrencyDollar, Lightning, Square } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/segmented";
import { confirmCheckIn, setFlags, setOnBench } from "../actions";

type Props = {
  number: string;
  sourceLine: string;
  received: boolean;
  priority: boolean;
  needsPayment: boolean;
  returnToEverett: boolean;
  canAct: boolean;
};

/** S3: the on-the-bench tick, flags, the greyed label, the logged email, and Confirm. */
export function CheckInStep({ number, sourceLine, received, priority, needsPayment, returnToEverett, canAct }: Props) {
  const router = useRouter();
  const [onBench, setBench] = useState(received);
  const [flags, setLocalFlags] = useState({ priority, needsPayment, returnToEverett });
  const [email, setEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggleBench() {
    const next = !onBench;
    setBench(next);
    setError(null);
    start(async () => {
      const r = await setOnBench(number, next);
      if (!r.ok) {
        setBench(!next);
        setError(r.error);
      }
    });
  }

  function patchFlags(p: Partial<typeof flags>) {
    const next = { ...flags, ...p };
    setLocalFlags(next);
    start(async () => {
      const r = await setFlags(number, next);
      if (!r.ok) {
        setLocalFlags(flags);
        setError(r.error);
      }
    });
  }

  function confirm() {
    setError(null);
    start(async () => {
      const r = await confirmCheckIn(number, { emailCustomer: email });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <span className="text-[11px] uppercase tracking-label text-ink-3">{sourceLine}{canAct ? " · everything on the left is editable" : ""}</span>

      <button
        type="button"
        onClick={toggleBench}
        disabled={!canAct || pending}
        aria-pressed={onBench}
        className="flex items-center gap-2.5 self-start text-[15px] text-ink-2 transition-colors hover:text-ink disabled:opacity-100"
      >
        {onBench ? <CheckSquare size={22} className="text-gold-light" /> : <Square size={22} className="text-ink-3" />}
        Watch is on the bench
      </button>

      <div className="flex flex-wrap gap-2">
        <ToggleChip on={flags.priority} onChange={(v) => canAct && patchFlags({ priority: v })} tone="coral"><Lightning size={12} /> Priority</ToggleChip>
        <ToggleChip on={flags.needsPayment} onChange={(v) => canAct && patchFlags({ needsPayment: v })}><CurrencyDollar size={12} /> Needs payment</ToggleChip>
        <ToggleChip on={flags.returnToEverett} onChange={(v) => canAct && patchFlags({ returnToEverett: v })}><ArrowUUpLeft size={12} /> Return to Everett</ToggleChip>
      </div>

      <div className="flex flex-wrap items-center gap-3.5">
        <Button size="sm" disabled title="ShipStation arrives later">Print prepaid return label</Button>
        <span className="text-[13px] text-ink-3">ShipStation · coming soon</span>
      </div>

      <button type="button" onClick={() => setEmail((e) => !e)} aria-pressed={email} className="flex items-center gap-2 self-start text-sm text-ink-2 hover:text-ink">
        {email ? <CheckSquare size={18} className="text-gold-light" /> : <Square size={18} className="text-ink-3" />}
        Email the customer &ldquo;Request received&rdquo; when I confirm
      </button>

      {canAct ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button variant="primary" disabled={!onBench || pending} onClick={confirm}>
            {pending ? "Confirming…" : "Confirm check in"} <ArrowRight size={14} /> Inspect
          </Button>
          {!onBench ? (
            <span className="text-[13px] text-ink-3"><span className="text-amber">1 left:</span> tick &ldquo;on the bench&rdquo;</span>
          ) : null}
          {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">Waiting for the bench or the Nodus rep to confirm check in.</p>
      )}
    </>
  );
}
