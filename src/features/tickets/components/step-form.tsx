"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowUUpLeft, Check, CheckSquare, Package, Square, X } from "@phosphor-icons/react";
import { BigTick } from "@/components/ui/big-tick";
import { Button } from "@/components/ui/button";
import { ChoicePair } from "@/components/ui/choice-pair";
import { STAGE_LABELS, TEST_KINDS, TEST_LABELS, nextStage, type Step, type TestKind } from "@/features/pipeline";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { advanceTicket, clearTest, failTest, passTest, postToSlack, saveShipping, sendBack, setPartsReceived, setPayment, setPaymentReceived, setStepAnswer, setStepNotes, skipToShip } from "../actions";
import { SlackCard, parseSlackBody } from "./slack-card";
import { StepActions } from "./step-actions";

/**
 * The open step's form, driven by its ticket_steps row (answer, notes,
 * done). The shared pieces (big tick, yes / no pair, Slack card, action
 * row) are the handoff's; each step's own layout lands in rounds 3–6.
 */

export type StepFormProps = {
  number: string;
  stage: Step;
  answer: boolean | null;
  notes: string;
  doneAt: string | null;
  /** When the answer was last set, for the tick's time line after a reload. */
  answeredAt: string | null;
  /** Inspect is parked: anyone in scope may pick Yes, not just the step's owner. */
  canUnpark: boolean;
  /** The step "Back to" returns to: the last one worked, skipping skipped ones. */
  backTo: Step | null;
  needsPayment: boolean;
  issue: string | null;
  inspectNotes: string | null;
  customer: string;
  watch: string;
  payment: { amount: number | null; invoiceSentAt: string | null };
  tests: { attempt: number; passed: TestKind[]; previousFails: { attempt: number; kind: TestKind; note: string | null }[] };
  ship: { carrier: string; tracking: string; labelUrl: string; shipToLine: string | null };
  slackChannel: string | null;
  slack: { postedAt: string; by: string; body: string; replies: number; lastReply: string | null; failed: string | null } | null;
  canAct: boolean;
  isAdmin: boolean;
};

const NOTES: Partial<Record<Step, { label: string; placeholder: string }>> = {
  inspect: { label: "Additional comments", placeholder: "What you found on the bench" },
  supply: { label: "Parts you need · one per line", placeholder: "1× Dial, Sector GMT (black)" },
  repair: { label: "What you did", placeholder: "Replaced crown tube and signed crown…" },
  test: { label: "Test notes", placeholder: "+2 s/d dial up, amplitude 280°. 200 m pass." },
};

const PRIMARY: Record<Step, string> = {
  check_in: "Received",
  inspect: "Inspection done",
  supply: "Parts in hand",
  repair: "Repaired",
  test: "Tests passed",
  payment: "Paid",
  ship: "Shipped",
};

export function StepForm(p: StepFormProps) {
  const router = useRouter();
  const [answer, setAnswer] = useState(p.answer);
  const [notes, setNotes] = useState(p.notes);
  const [received, setReceived] = useState(!!p.doneAt);
  const [editingList, setEditingList] = useState(false);
  const [passed, setPassed] = useState<TestKind[]>(p.tests.passed);
  const [failing, setFailing] = useState<TestKind | null>(null);
  const [failNote, setFailNote] = useState("");
  const [amount, setAmount] = useState(p.payment.amount?.toString() ?? "");
  const [invoiceSent, setInvoiceSent] = useState(!!p.payment.invoiceSentAt);
  const [ship, setShip] = useState({ carrier: p.ship.carrier, tracking: p.ship.tracking, labelUrl: p.ship.labelUrl });
  const [tickedAt, setTickedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, start] = useTransition();
  const [saving, save] = useTransition();
  const pending = acting || saving;

  const next = nextStage(p.stage, p.needsPayment);
  const prev = p.backTo;
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

  function pickAnswer(v: boolean | null) {
    if (!p.canAct && !(p.canUnpark && v === true)) return;
    const was = answer;
    setAnswer(v);
    setTickedAt(v ? new Date() : null);
    if (p.stage === "supply" && v !== false) setReceived(false);
    save(async () => {
      const r = await setStepAnswer(p.number, p.stage, v);
      if (!r.ok) {
        setAnswer(was);
        setError(r.error);
        return;
      }
      // Cannot replicate parks the watch and tells Nodus straight away when the comments are already written.
      if (p.stage === "inspect" && v === false && p.canAct && !p.slack && notes.trim()) {
        if (notes !== p.notes) await setStepNotes(p.number, p.stage, notes);
        const posted = await postToSlack(p.number, "cannot_replicate");
        if (posted.ok && posted.slack && !posted.slack.ok) setNotice(`Parked on the ticket, but Slack said: ${posted.slack.error}`);
      }
      router.refresh();
    });
  }

  function blurNotes() {
    if (!p.canAct || notes === p.notes) return;
    save(async () => {
      const r = await setStepNotes(p.number, p.stage, notes);
      if (!r.ok) setError(r.error);
    });
  }

  function post() {
    run(async () => {
      if (notes !== p.notes) await setStepNotes(p.number, p.stage, notes);
      const r = await postToSlack(p.number, p.stage === "supply" ? "parts_needed" : "cannot_replicate");
      if (r.ok && r.slack && !r.slack.ok) setNotice(`Saved on the ticket, but Slack said: ${r.slack.error}`);
      return r;
    }, () => setEditingList(false));
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
  if (p.stage === "supply" && answer === false && !received) left.push(p.slack ? "parts received" : "request or confirm parts");
  if (p.stage === "repair" && !answer) left.push("tick “Repair complete”");
  if (p.stage === "test") left.push(...TEST_KINDS.filter((k) => !passed.includes(k)).map((k) => TEST_LABELS[k]));
  if (p.stage === "payment" && p.needsPayment && !answer) left.push("payment received");
  if (p.stage === "ship" && !ship.tracking.trim() && !ship.labelUrl.trim()) left.push("label or tracking");
  const parked = p.stage === "inspect" && answer === false;
  const canOverride = p.stage === "payment" && p.isAdmin && p.needsPayment && !answer;
  const showSlack = (p.stage === "inspect" && answer === false) || (p.stage === "supply" && answer === false);
  const slackTitle = p.stage === "supply" ? "Parts needed" : "Cannot replicate reported issue";
  const slackParts = p.slack ? parseSlackBody(p.slack.body) : null;

  const tickHint = (text: string) => {
    const d = tickedAt ?? (p.answeredAt ? new Date(p.answeredAt) : null);
    return d ? `${formatDate(d.toISOString())} · ${formatTime(d)} · ${text}` : text;
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {p.stage === "check_in" ? (
        <BigTick on={!!answer} onToggle={() => pickAnswer(!answer)} label="I have the watch" hint={answer ? tickHint("emails the customer “We received your watch”.") : "Emails the customer “We received your watch”."} disabled={!p.canAct || pending} />
      ) : null}

      {p.stage === "inspect" || p.stage === "repair" ? (
        <Block label={p.stage === "inspect" ? "Reported issue" : "From Inspect"}>
          <p className="text-[16px] leading-[1.5] text-ink-2">{(p.stage === "inspect" ? p.issue : p.inspectNotes) || <span className="text-ink-3">Nothing recorded.</span>}</p>
        </Block>
      ) : null}

      {p.stage === "inspect" ? (
        <Block label="Is the reported issue present?" gap="gap-2.5">
          <ChoicePair
            value={answer}
            onChange={pickAnswer}
            yes={{ title: "Yes, I can see it", hint: "On to Supply." }}
            no={{ title: "No, cannot find or replicate it", hint: parked ? "Pick “Yes” to unpark and keep going." : "Parks here and tells Nodus customer service on Slack.", tone: "coral" }}
            disabled={(!p.canAct && !p.canUnpark) || pending}
            aria-label="Is the reported issue present?"
          />
        </Block>
      ) : null}

      {p.stage === "supply" ? (
        <Block label="Do you have the parts for this repair?" gap="gap-2.5">
          <ChoicePair
            value={answer}
            onChange={pickAnswer}
            yes={{ title: "Yes, I have everything", hint: "Straight on to Repair." }}
            no={{ title: "No, I need parts", hint: "List them below and request on Slack." }}
            disabled={!p.canAct || pending}
            aria-label="Do you have the parts for this repair?"
          />
        </Block>
      ) : null}

      {noteSpec && (p.stage !== "supply" || (answer === false && (!p.slack || editingList))) ? (
        <label className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">{noteSpec.label}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={blurNotes}
            disabled={!p.canAct}
            rows={p.stage === "test" ? 2 : 4}
            placeholder={noteSpec.placeholder}
            className="min-h-24 w-full resize-y rounded-xs border border-border-strong bg-transparent px-3.5 py-3 text-[15px] leading-[1.6] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
          />
        </label>
      ) : null}

      {showSlack && p.slack && slackParts ? (
        <SlackCard
          channel={p.slackChannel}
          postedAt={p.slack.postedAt}
          by={p.slack.by}
          title={slackTitle}
          number={p.number}
          watch={p.watch}
          customer={p.customer}
          lines={slackParts.lines}
          quote={slackParts.quote}
          replies={p.slack.replies}
          replyNote={p.slack.lastReply ? `“${p.slack.lastReply}”` : p.stage === "inspect" ? "Customer service asks the customer, then replies here." : null}
          failed={p.slack.failed}
          onEdit={p.canAct && p.stage === "supply" ? () => setEditingList((v) => !v) : undefined}
          onRepost={p.canAct ? post : undefined}
          busy={pending}
        />
      ) : null}

      {showSlack && p.canAct && !p.slack ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button size="sm" variant="primary" disabled={pending || !notes.trim()} onClick={post}>
            {p.stage === "supply" ? "Request parts on Slack" : "Tell Nodus on Slack"}
          </Button>
          <span className="text-[13px] text-ink-3">
            {p.stage === "supply" ? `Posts to ${p.slackChannel ?? "Slack"} with your inspection comments attached. The ticket waits here until the parts arrive.` : notes.trim() ? `Posts your comments to ${p.slackChannel ?? "Slack"} so customer service can follow up.` : "Write what you found above, then tell Nodus."}
          </span>
        </div>
      ) : null}

      {p.stage === "supply" && answer === false && p.slack ? (
        <BigTick on={received} onToggle={() => { const v = !received; setReceived(v); run(() => setPartsReceived(p.number, v)); }} label="Parts received" hint="Tick once everything on the list is on your bench." disabled={!p.canAct || pending} />
      ) : null}

      {p.stage === "repair" ? (
        <BigTick on={!!answer} onToggle={() => pickAnswer(!answer)} label="Repair complete" hint={answer ? tickHint("ready for Test.") : "Tick when the work above is done."} disabled={!p.canAct || pending} />
      ) : null}

      {p.stage === "test" ? (
        <div className="flex flex-col gap-2.5">
          {p.tests.attempt > 1 ? (
            <span className="text-[11px] uppercase tracking-label text-amber">
              Attempt {p.tests.attempt} · <span className="normal-case tracking-normal">{p.tests.previousFails.map((f) => `${TEST_LABELS[f.kind]} failed${f.note ? ` (${f.note})` : ""}`).join(" · ")}</span>
            </span>
          ) : null}
          {TEST_KINDS.map((kind) => {
            const ok = passed.includes(kind);
            return (
              <div key={kind} className={cn("flex flex-wrap items-center gap-3 rounded-xs border px-[18px] py-3.5", ok ? "border-green/60 bg-green/5" : failing === kind ? "border-coral/60 bg-coral/5" : "border-border-strong")}>
                <span className="flex-1 text-[17px] font-medium text-ink">{TEST_LABELS[kind]}</span>
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
                {invoiceSent ? `Sent${p.payment.invoiceSentAt ? ` ${formatDate(p.payment.invoiceSentAt)}` : " today"}` : "Not sent yet"}
              </button>
            </Block>
            <Block label="Status">
              <span className={cn("text-[15px]", answer ? "text-green" : "text-amber")}>{answer ? "Paid" : "Not paid yet"}</span>
            </Block>
          </div>
          <BigTick on={!!answer} onToggle={() => { const v = !answer; setAnswer(v); run(() => setPaymentReceived(p.number, v)); }} label="Payment received" hint="Tick when the customer has paid. Warranty repairs skip this step." disabled={!p.canAct || pending} />
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

      <StepActions
        label={PRIMARY[p.stage]}
        next={next ? STAGE_LABELS[next] : null}
        onPrimary={() => run(() => advanceTicket(p.number))}
        blocked={parked}
        left={left}
        note={parked ? "Parked until Nodus replies." : p.stage === "check_in" ? "Nothing else to fill in here." : p.stage === "test" && !p.needsPayment ? "Payment not required, skipped" : undefined}
        pending={pending}
        canAct={p.canAct}
        backLabel={prev && !parked ? STAGE_LABELS[prev] : null}
        onBack={() => prev && run(() => sendBack(p.number, prev))}
        extra={
          <>
            {p.stage === "inspect" && answer === false ? (
              <button type="button" disabled={pending || !notes.trim()} onClick={() => run(() => skipToShip(p.number))} className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
                <Package size={14} aria-hidden /> Nothing wrong · skip to Ship
              </button>
            ) : null}
            {canOverride ? (
              <button type="button" disabled={pending} onClick={() => run(() => advanceTicket(p.number, { override: true }))} className="text-[13px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
                Owner override · ship unpaid
              </button>
            ) : null}
          </>
        }
      />
      {error ? <p role="alert" className="text-[13px] text-coral">{error}</p> : null}
      {notice ? <p role="status" className="text-[13px] text-amber">{notice}</p> : null}
    </div>
  );
}

function Block({ label, gap = "gap-2", children }: { label: string; gap?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col", gap)}>
      <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
      {children}
    </div>
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
