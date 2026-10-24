"use client";

import { ArrowUUpLeft, CheckCircle, Circle, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { TEST_KINDS, TEST_LABELS, type TestKind } from "@/features/pipeline";
import { cn } from "@/lib/utils";

/**
 * The handoff's Test rows: one per check with its description and a
 * Pass | Fail pair on the right. A passed row gets the gold border and
 * panel fill; picking Fail opens the note line under the row, and
 * "Send back to Repair" carries the note with it.
 */
export const TEST_DESCRIPTIONS: Record<TestKind, string> = {
  time: "Rate and amplitude within spec on the timegrapher.",
  water: "Pressure test passed to the model's rating.",
  looks: "Dial, hands, crystal and case clean; no marks from the work.",
};

export function TestRows({
  passed,
  failing,
  failNote,
  onPass,
  onFailPick,
  onFailNote,
  onSendBack,
  disabled,
}: {
  passed: TestKind[];
  failing: TestKind | null;
  failNote: string;
  onPass: (kind: TestKind) => void;
  onFailPick: (kind: TestKind | null) => void;
  onFailNote: (v: string) => void;
  onSendBack: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {TEST_KINDS.map((kind) => {
        const ok = passed.includes(kind);
        const fail = failing === kind;
        return (
          <div key={kind} className={cn("flex flex-col rounded-xs border", ok ? "border-gold bg-panel" : fail ? "border-coral" : "border-border-strong")}>
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-[18px] py-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[17px] font-medium text-ink">
                  {ok ? <CheckCircle size={18} className="shrink-0 text-green" aria-hidden /> : fail ? <XCircle size={18} className="shrink-0 text-coral" aria-hidden /> : <Circle size={18} className="shrink-0 text-ink-3" aria-hidden />}
                  {TEST_LABELS[kind]}
                </span>
                <span className="text-[13px] text-ink-3">{TEST_DESCRIPTIONS[kind]}</span>
              </div>
              <span role="radiogroup" aria-label={`${TEST_LABELS[kind]} result`} className="inline-flex rounded-xs border border-border-strong text-[13px]">
                <button
                  type="button"
                  role="radio"
                  aria-checked={ok}
                  disabled={disabled}
                  onClick={() => onPass(kind)}
                  className={cn("px-3.5 py-[7px] transition-colors disabled:cursor-default", ok ? "bg-panel text-green" : "text-ink-2 hover:text-ink")}
                >
                  Pass
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={fail}
                  disabled={disabled}
                  onClick={() => onFailPick(fail ? null : kind)}
                  className={cn("border-l border-border-strong px-3.5 py-[7px] transition-colors disabled:cursor-default", fail ? "bg-panel text-coral" : "text-ink-2 hover:text-ink")}
                >
                  Fail
                </button>
              </span>
            </div>
            {fail ? (
              <div className="flex flex-col gap-3 border-t border-coral/40 px-[18px] py-3.5 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-2 text-[11px] uppercase tracking-label text-ink-3">
                  What failed on {TEST_LABELS[kind]}?
                  <input
                    value={failNote}
                    onChange={(e) => onFailNote(e.target.value)}
                    autoFocus
                    placeholder="Running −20 s/d, amplitude low…"
                    className="h-9 border-b border-border-strong bg-transparent text-[15px] normal-case tracking-normal text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
                  />
                </label>
                <Button size="sm" variant="ghost" onClick={() => onFailPick(null)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={disabled} onClick={onSendBack} className="border-coral text-coral hover:bg-coral/10">
                  Send back to Repair <ArrowUUpLeft size={13} aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
