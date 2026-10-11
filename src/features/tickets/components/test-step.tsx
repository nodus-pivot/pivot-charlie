"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, Check, Drop, Eye, Info, Timer, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { advanceTicket, clearTest, failTest, passTest, saveStageNote, sendBack, type TestKind } from "../actions";

const TESTS: { kind: TestKind; label: string; description: string; Icon: typeof Timer }[] = [
  { kind: "time", label: "Time", description: "Rate and beat on the timegrapher within spec.", Icon: Timer },
  { kind: "water", label: "Water", description: "Pressure test to the model's rating.", Icon: Drop },
  { kind: "looks", label: "Looks", description: "Dial, hands, crystal, case clean. No marks from the work.", Icon: Eye },
];

type Props = {
  number: string;
  attempt: number;
  passed: TestKind[];
  previousFails: { attempt: number; kind: TestKind; note: string | null; date: string }[];
  note: string;
  canAct: boolean;
};

/** S8: three checks with Pass / Fail. A Fail returns the watch to Fix with the test noted. */
export function TestStep({ number, attempt, passed: initialPassed, previousFails, note, canAct }: Props) {
  const router = useRouter();
  const [passed, setPassed] = useState<TestKind[]>(initialPassed);
  const [failing, setFailing] = useState<TestKind | null>(null);
  const [failNote, setFailNote] = useState("");
  const [text, setText] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const left = TESTS.filter((t) => !passed.includes(t.kind));

  function pass(kind: TestKind) {
    if (!canAct) return;
    setError(null);
    const was = passed.includes(kind);
    setPassed((p) => (was ? p.filter((k) => k !== kind) : [...p, kind]));
    if (failing === kind) setFailing(null);
    save(async () => {
      const r = was ? await clearTest(number, kind) : await passTest(number, kind);
      if (!r.ok) {
        setPassed((p) => (was ? [...p, kind] : p.filter((k) => k !== kind)));
        setError(r.error);
      }
    });
  }

  function fail() {
    if (!failing) return;
    setError(null);
    start(async () => {
      const r = await failTest(number, failing, failNote);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function done() {
    setError(null);
    start(async () => {
      const r = await advanceTicket(number, "ship");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function back() {
    setError(null);
    start(async () => {
      const r = await sendBack(number, "fix");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {attempt > 1 ? (
        <span className="text-[11px] uppercase tracking-label text-amber">
          Attempt {attempt} ·{" "}
          <span className="normal-case tracking-normal">
            {previousFails.map((f) => `${TESTS.find((t) => t.kind === f.kind)?.label} failed ${f.date}${f.note ? ` (${f.note})` : ""}`).join(" · ")}
          </span>
        </span>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {TESTS.map(({ kind, label, description, Icon }) => {
          const ok = passed.includes(kind);
          const isFailing = failing === kind;
          return (
            <div key={kind} className={cn("flex flex-col gap-3 rounded-xs border p-4 transition-colors", ok ? "border-green bg-green/5" : isFailing ? "border-coral bg-coral/5" : "border-rule bg-panel")}>
              <span className="flex items-center gap-2.5 font-display text-2xl font-semibold text-ink">
                <Icon size={20} className={ok ? "text-green" : isFailing ? "text-coral" : "text-ink-2"} />
                {label}
              </span>
              <p className="text-[13px] leading-relaxed text-ink-2">{description}</p>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => pass(kind)}
                  disabled={!canAct || pending}
                  aria-pressed={ok}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs leading-none transition-colors",
                    ok ? "border-green bg-green/14 text-green" : "border-border-strong text-ink-3 hover:border-green hover:text-green",
                  )}
                >
                  <Check size={11} /> Pass
                </button>
                <button
                  type="button"
                  onClick={() => { if (!canAct) return; setFailing(isFailing ? null : kind); setFailNote(""); setError(null); }}
                  disabled={!canAct || pending}
                  aria-pressed={isFailing}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs leading-none transition-colors",
                    isFailing ? "border-coral bg-coral/14 text-coral" : "border-border-strong text-ink-3 hover:border-coral hover:text-coral",
                  )}
                >
                  <X size={11} /> Fail
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {failing ? (
        <div className="flex flex-col gap-3 border border-coral/60 bg-coral/5 p-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-2 text-[11px] uppercase tracking-label text-ink-3">
            What failed on {TESTS.find((t) => t.kind === failing)?.label}?
            <input
              value={failNote}
              onChange={(e) => setFailNote(e.target.value)}
              placeholder="Running −20 s/d, amplitude low…"
              autoFocus
              className="h-9 border-b border-border-strong bg-transparent text-[15px] normal-case tracking-normal text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
            />
          </label>
          <Button size="sm" variant="ghost" onClick={() => setFailing(null)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={fail} className="border-coral text-coral hover:bg-coral/10">
            {pending ? "Sending back…" : "Send back to Fix"} <ArrowUUpLeft size={13} />
          </Button>
        </div>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-label text-ink-3">Test notes</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => canAct && text !== note && save(async () => { const r = await saveStageNote(number, "test", text); if (!r.ok) setError(r.error); })}
          disabled={!canAct}
          placeholder="Rate, amplitude, pressure reading…"
          className="h-10 border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
        />
      </label>

      <p className="flex items-start gap-2 text-[13px] text-ink-3">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden /> A Fail sends the watch back to Fix with the test noted.
      </p>

      {canAct ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button variant="primary" disabled={pending || left.length > 0} onClick={done}>
            Tests passed <ArrowRight size={14} /> Ship
          </Button>
          {left.length ? (
            <span className="text-[13px] text-ink-3">
              <span className="text-amber">{left.length} left:</span> {left.map((t) => t.label).join(", ")}
            </span>
          ) : null}
          {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
          <button type="button" onClick={back} disabled={pending} className="ml-auto flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowUUpLeft size={13} /> Back to Fix
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">{left.length ? `${left.length} of 3 checks still to run.` : "All checks passed; waiting for the watchmaker to ship."}</p>
      )}
    </>
  );
}
