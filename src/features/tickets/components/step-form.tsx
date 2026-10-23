"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowRight, ArrowUUpLeft, Check, CheckSquare, Square, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS, TEST_KINDS, TEST_LABELS, nextStage, previousStep, type Step, type TestKind } from "@/features/pipeline";
import { cn } from "@/lib/utils";
import { advanceTicket, clearTest, failTest, passTest, postToSlack, saveShipping, sendBack, setPartsReceived, setPayment, setPaymentReceived, setStepAnswer, setStepNotes, skipToShip } from "../actions";

/**
 * Round 1: one plain form for every open step, driven by the step row
 * (answer, notes, done). Rounds 2–6 replace the pieces with the handoff's
 * components; the actions it calls stay.
 */

export type StepFormProps = {
  number: string;
  stage: Step;
  answer: boolean | null;
  notes: string;
  doneAt: string | null;
  needsPayment: boolean;
  issue: string | null;
  inspectNotes: string | null;
  payment: { amount: number | null; invoiceSentAt: string | null };
  tests: { attempt: number; passed: TestKind[]; previousFails: { attempt: number; kind: TestKind; note: string | null }[] };
  ship: { carrier: string; tracking: string; labelUrl: string; shipToLine: string | null };
  slack: { postedAt: string; by: string; body: string; replies: number; lastReply: string | null; failed: string | null } | null;
  canAct: boolean;
  isAdmin: boolean;
};

const QUESTION: Partial<Record<Step, { q: string; yes: string; yesHint: string; no: string; noHint: string }>> = {
  inspect: { q: "Is the reported issue present?", yes: "Yes, I can see it", yesHint: "On to Supply.", no: "No, cannot find or replicate it", noHint: "Parks here and tells Nodus customer service on Slack." },
  supply: { q: "Do you have the parts for this repair?", yes: "Yes, I have everything", yesHint: "Straight on to Repair.", no: "No, I need parts", noHint: "List them below and request on Slack." },
};

const TICK: Partial<Record<Step, { label: string; hint: string }>> = {
  check_in: { label: "I have the watch", hint: "Logs the “We received your watch” email to the customer." },
  repair: { label: "Repair complete", hint: "" },
  payment: { label: "Payment received", hint: "Tick when the customer has paid. Warranty repairs skip this step." },
};

const NOTES: Partial<Record<Step, { label: string; placeholder: string }>> = {
  inspect: { label: "Additional comments", placeholder: "What you found on the bench" },
  supply: { label: "Parts you need · one per line", placeholder: "1× Dial, Sector GMT (black)" },
  repair: { label: "What you did", placeholder: "Replaced crown tube and signed crown…" },
  test: { label: "Test notes", placeholder: "+2 s/d dial up, amplitude 280°. 200 m pass." },
};

export function StepForm(p: StepFormProps) {
  const router = useRouter();
  const [answer, setAnswer] = useState(p.answer);
  const [notes, setNotes] = useState(p.notes);
  const [received, setReceived] = useState(!!p.doneAt);
  const [passed, setPassed] = useState<TestKind[]>(p.tests.passed);
  const [failing, setFailing] = useState<TestKind | null>(null);
  const [failNote, setFailNote] = useState("");
  const [amount, setAmount] = useState(p.payment.amount?.toString() ?? "");
  const [invoiceSent, setInvoiceSent] = useState(!!p.payment.invoiceSentAt);
  const [ship, setShip] = useState({ carrier: p.ship.carrier, tracking: p.ship.tracking, labelUrl: p.ship.labelUrl });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, start] = useTransition();
  const [saving, save] = useTransition();
  const pending = acting || saving;

  const next = nextStage(p.stage, p.needsPayment);
  const prev = previousStep(p.stage, p.needsPayment);
  const q = QUESTION[p.stage];
  const tick = TICK[p.stage];
  const noteSpec = NOTES[p.stage];

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function pickAnswer(v: boolean) {
    if (!p.canAct) return;
    const was = answer;
    setAnswer(v);
    if (p.stage === "supply" && v) setReceived(false);
    save(async () => {
      const r = await setStepAnswer(p.number, p.stage, v);
      if (!r.ok) {
        setAnswer(was);
        setError(r.error);
      } else router.refresh();
    });
  }

  function blurNotes() {
    if (!p.canAct || notes === p.notes) return;
    save(async () => {
      const r = await setStepNotes(p.number, p.stage, notes);
      if (!r.ok) setError(r.error);
    });
  }

  function toggleTest(kind: TestKind) {
    if (!p.canAct) return;
    const was = passed.includes(kind);
    setPassed((x) => (was ? x.filter((k) => k !== kind) : [...x, kind]));
    if (failing === kind) setFailing(null);
    save(async () => {
      const r = was ? await clearTest(p.number, kind) : await passTest(p.number, kind);
      if (!r.ok) {
        setPassed((x) => (was ? [...x, kind] : x.filter((k) => k !== kind)));
        setError(r.error);
      }
    });
  }

  // What still blocks the primary button, mirrored from advance()'s gates.
  const left: string[] = [];
  if (p.stage === "check_in" && !answer) left.push("tick “I have the watch”");
  if (p.stage === "inspect") {
    if (answer === null) left.push("answer yes or no");
    if (!notes.trim()) left.push("add comments");
  }
  if (p.stage === "supply" && answer === null) left.push("answer yes or no");
  if (p.stage === "supply" && answer === false && !received) left.push("request or confirm parts");
  if (p.stage === "repair" && !answer) left.push("tick “Repair complete”");
  if (p.stage === "test") left.push(...TEST_KINDS.filter((k) => !passed.includes(k)).map((k) => TEST_LABELS[k]));
  if (p.stage === "payment" && p.needsPayment && !answer) left.push("payment received");
  if (p.stage === "ship" && !ship.tracking.trim() && !ship.labelUrl.trim()) left.push("label or tracking");
  const parked = p.stage === "inspect" && answer === false;
  const blocked = left.length > 0 || parked;
  const canOverride = p.stage === "payment" && p.isAdmin && p.needsPayment && !answer;

  const primaryLabel: Record<Step, string> = {
    check_in: "Received",
    inspect: "Inspection done",
    supply: "Parts in hand",
    repair: "Repaired",
    test: "Tests passed",
    payment: "Paid",
    ship: "Shipped",
  };

  return (
    <div className="flex flex-col gap-5">
      {p.stage === "inspect" || p.stage === "repair" ? (
        <Block label={p.stage === "inspect" ? "Reported issue" : "From Inspect"}>
          <p className="text-[15px] leading-relaxed text-ink-2">{(p.stage === "inspect" ? p.issue : p.inspectNotes) || <span className="text-ink-3">Nothing recorded.</span>}</p>
        </Block>
      ) : null}

      {q ? (
        <Block label={q.q}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice on={answer === true} onPick={() => pickAnswer(true)} title={q.yes} hint={q.yesHint} disabled={!p.canAct || pending} />
            <Choice on={answer === false} onPick={() => pickAnswer(false)} title={q.no} hint={parked ? "Pick “Yes” to unpark and keep going." : q.noHint} disabled={!p.canAct || pending} tone="coral" />
          </div>
        </Block>
      ) : null}

      {tick && p.stage !== "payment" ? (
        <BigTick on={!!answer} onToggle={() => pickAnswer(!answer)} label={tick.label} hint={tick.hint} disabled={!p.canAct || pending} />
      ) : null}

      {noteSpec && (p.stage !== "supply" || answer === false) ? (
        <label className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">{noteSpec.label}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={blurNotes}
            disabled={!p.canAct}
            rows={p.stage === "test" ? 2 : 4}
            placeholder={noteSpec.placeholder}
            className="w-full resize-y rounded-xs border border-rule bg-panel px-3 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
          />
        </label>
      ) : null}

      {(p.stage === "inspect" && answer === false) || (p.stage === "supply" && answer === false) ? (
        <div className="flex flex-col gap-3">
          {p.slack ? (
            <div className={cn("flex flex-col gap-2 rounded-xs border p-4", p.slack.failed ? "border-coral/60" : "border-rule bg-panel")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-ink-3">
                <span>{p.slack.failed ? <span className="text-coral">Slack post failed · {p.slack.failed}</span> : <span className="text-green">Posted to Slack</span>}</span>
                <span>{p.slack.postedAt} · {p.slack.by}</span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink-2">{p.slack.body}</pre>
              <span className="text-[12px] text-ink-3">
                {p.slack.replies ? `${p.slack.replies} repl${p.slack.replies === 1 ? "y" : "ies"}${p.slack.lastReply ? ` · “${p.slack.lastReply}”` : ""}` : "No replies yet"}
              </span>
            </div>
          ) : null}
          {p.canAct ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={pending || !notes.trim()}
                onClick={() =>
                  run(
                    async () => {
                      if (notes !== p.notes) await setStepNotes(p.number, p.stage, notes);
                      const r = await postToSlack(p.number, p.stage === "supply" ? "parts_needed" : "cannot_replicate");
                      if (r.ok && r.slack && !r.slack.ok) setNotice(`Saved on the ticket, but Slack said: ${r.slack.error}`);
                      return r;
                    },
                  )
                }
              >
                {p.slack ? "Post again" : p.stage === "supply" ? "Request parts on Slack" : "Tell Nodus on Slack"}
              </Button>
              {p.stage === "supply" ? (
                <BigTick on={received} onToggle={() => { const v = !received; setReceived(v); run(() => setPartsReceived(p.number, v)); }} label="Parts received" hint="Tick once everything on the list is on your bench." disabled={pending} compact />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {p.stage === "test" ? (
        <div className="flex flex-col gap-2">
          {p.tests.attempt > 1 ? (
            <span className="text-[11px] uppercase tracking-label text-amber">
              Attempt {p.tests.attempt} · <span className="normal-case tracking-normal">{p.tests.previousFails.map((f) => `${TEST_LABELS[f.kind]} failed${f.note ? ` (${f.note})` : ""}`).join(" · ")}</span>
            </span>
          ) : null}
          {TEST_KINDS.map((kind) => {
            const ok = passed.includes(kind);
            return (
              <div key={kind} className={cn("flex flex-wrap items-center gap-3 rounded-xs border px-4 py-3", ok ? "border-green/60 bg-green/5" : failing === kind ? "border-coral/60 bg-coral/5" : "border-rule bg-panel")}>
                <span className="flex-1 text-[15px] text-ink">{TEST_LABELS[kind]}</span>
                <Pill on={ok} tone="green" onClick={() => toggleTest(kind)} disabled={!p.canAct || pending}><Check size={11} /> Pass</Pill>
                <Pill on={failing === kind} tone="coral" onClick={() => { if (!p.canAct) return; setFailing(failing === kind ? null : kind); setFailNote(""); }} disabled={!p.canAct || pending}><X size={11} /> Fail</Pill>
              </div>
            );
          })}
          {failing ? (
            <div className="flex flex-col gap-3 border border-coral/60 bg-coral/5 p-4 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-2 text-[11px] uppercase tracking-label text-ink-3">
                What failed on {TEST_LABELS[failing]}?
                <input value={failNote} onChange={(e) => setFailNote(e.target.value)} autoFocus className="h-9 border-b border-border-strong bg-transparent text-[15px] normal-case tracking-normal text-ink outline-none focus:border-gold" />
              </label>
              <Button size="sm" variant="ghost" onClick={() => setFailing(null)}>Cancel</Button>
              <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => failTest(p.number, failing, failNote))} className="border-coral text-coral hover:bg-coral/10">
                Send back to Repair <ArrowUUpLeft size={13} />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {p.stage === "payment" ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Block label="Repair cost">
              <span className="flex items-baseline gap-1 font-display text-[28px] font-semibold text-ink">
                $
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  onBlur={() => p.canAct && run(() => setPayment(p.number, { amount: amount ? Number(amount) : null, invoiceSent }))}
                  disabled={!p.canAct}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-28 bg-transparent font-display text-[28px] font-semibold text-ink outline-none placeholder:text-ink-3"
                  aria-label="Repair cost"
                />
              </span>
            </Block>
            <Block label="Invoice">
              <button type="button" disabled={!p.canAct || pending} onClick={() => { const v = !invoiceSent; setInvoiceSent(v); run(() => setPayment(p.number, { amount: amount ? Number(amount) : null, invoiceSent: v })); }} className="flex items-center gap-2 text-[15px] text-ink-2 hover:text-ink">
                {invoiceSent ? <CheckSquare size={20} className="text-gold-light" /> : <Square size={20} className="text-ink-3" />}
                {invoiceSent ? `Sent${p.payment.invoiceSentAt ? "" : " today"}` : "Not sent yet"}
              </button>
            </Block>
            <Block label="Status">
              <span className={cn("text-[15px]", answer ? "text-green" : "text-amber")}>{answer ? "Paid" : "Not paid yet"}</span>
            </Block>
          </div>
          <BigTick on={!!answer} onToggle={() => { const v = !answer; setAnswer(v); run(() => setPaymentReceived(p.number, v)); }} label={TICK.payment!.label} hint={TICK.payment!.hint} disabled={!p.canAct || pending} />
        </div>
      ) : null}

      {p.stage === "ship" ? (
        <div className="flex flex-col gap-4">
          <Block label="Ship to">
            <span className="text-[15px] text-ink">{p.ship.shipToLine || <span className="text-amber">No address on the ticket</span>}</span>
          </Block>
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <Field label="Carrier" value={ship.carrier} onChange={(v) => setShip({ ...ship, carrier: v })} onBlur={() => p.canAct && run(() => saveShipping(p.number, ship))} placeholder="USPS" disabled={!p.canAct} />
            <Field label="Tracking" value={ship.tracking} onChange={(v) => setShip({ ...ship, tracking: v })} onBlur={() => p.canAct && run(() => saveShipping(p.number, ship))} placeholder="9400 1108 …" disabled={!p.canAct} mono />
          </div>
          <p className="text-[13px] text-ink-3">Generate label (ShipStation) arrives in a later round; enter tracking by hand for now.</p>
        </div>
      ) : null}

      {p.canAct ? (
        <div className="flex flex-wrap items-center gap-3.5 border-t border-rule pt-4">
          <Button variant="primary" disabled={pending || blocked} onClick={() => run(() => advanceTicket(p.number))} className={cn(blocked && "opacity-60")}>
            {pending ? "Saving…" : primaryLabel[p.stage]} <ArrowRight size={14} /> {next ? STAGE_LABELS[next] : ""}
          </Button>
          {parked ? (
            <span className="text-[13px] text-ink-3">Parked until Nodus replies.</span>
          ) : left.length ? (
            <span className="text-[13px] text-ink-3"><span className="text-amber">{left.length} left:</span> {left.join(", ")}</span>
          ) : null}
          {p.stage === "inspect" && answer === false ? (
            <Button size="sm" disabled={pending || !notes.trim()} onClick={() => run(() => skipToShip(p.number))}>Nothing wrong · skip to Ship</Button>
          ) : null}
          {canOverride ? (
            <Button size="sm" disabled={pending} onClick={() => run(() => advanceTicket(p.number, { override: true }))}>Owner override · ship unpaid</Button>
          ) : null}
          {prev ? (
            <button type="button" disabled={pending} onClick={() => run(() => sendBack(p.number, prev))} className="ml-auto flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
              <ArrowUUpLeft size={13} /> Back to {STAGE_LABELS[prev]}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">Waiting for the bench.</p>
      )}
      {error ? <p role="alert" className="text-[13px] text-coral">{error}</p> : null}
      {notice ? <p role="status" className="text-[13px] text-amber">{notice}</p> : null}
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function Choice({ on, onPick, title, hint, disabled, tone }: { on: boolean; onPick: () => void; title: string; hint: string; disabled: boolean; tone?: "coral" }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xs border p-4 text-left transition-colors",
        on ? (tone === "coral" ? "border-coral bg-coral/5" : "border-gold bg-gold/5") : "border-rule bg-panel hover:border-border-strong",
      )}
    >
      <span className={cn("text-[15px]", on && tone === "coral" ? "text-coral" : "text-ink")}>{title}</span>
      <span className="text-[13px] text-ink-3">{hint}</span>
    </button>
  );
}

function BigTick({ on, onToggle, label, hint, disabled, compact }: { on: boolean; onToggle: () => void; label: string; hint: string; disabled: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn("flex items-start gap-3 rounded-xs border text-left transition-colors", compact ? "px-3 py-2" : "p-4", on ? "border-gold bg-panel" : "border-rule hover:border-border-strong")}
    >
      {on ? <CheckSquare size={compact ? 20 : 26} className="mt-0.5 shrink-0 text-gold-light" /> : <Square size={compact ? 20 : 26} className="mt-0.5 shrink-0 text-ink-3" />}
      <span className="flex flex-col gap-0.5">
        <span className={cn(compact ? "text-[14px]" : "text-[17px]", "text-ink")}>{label}</span>
        {hint ? <span className="text-[13px] text-ink-3">{hint}</span> : null}
      </span>
    </button>
  );
}

function Pill({ on, tone, onClick, disabled, children }: { on: boolean; tone: "green" | "coral"; onClick: () => void; disabled: boolean; children: ReactNode }) {
  const active = tone === "green" ? "border-green bg-green/14 text-green" : "border-coral bg-coral/14 text-coral";
  const hover = tone === "green" ? "hover:border-green hover:text-green" : "hover:border-coral hover:text-coral";
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs leading-none transition-colors", on ? active : `border-border-strong text-ink-3 ${hover}`)}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, onBlur, placeholder, disabled, mono }: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string; disabled?: boolean; mono?: boolean }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} placeholder={placeholder} className={cn("h-10 border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none", mono && "font-mono")} />
    </label>
  );
}
