"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CrownSimple, Package } from "@phosphor-icons/react";
import { BigTick } from "@/components/ui/big-tick";
import { Button } from "@/components/ui/button";
import { ChoicePair } from "@/components/ui/choice-pair";
import { STAGE_LABELS, TEST_KINDS, TEST_LABELS, nextStage, type Step, type TestKind } from "@/features/pipeline";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { advanceTicket, clearTest, failTest, passTest, postToSlack, saveShipping, sendBack, sendInvoice, setPartsReceived, setPaymentAmount, setPaymentReceived, setStepAnswer, setStepNotes, skipToShip, updateShipTo } from "../actions";
import { SlackCard, parseSlackBody } from "./slack-card";
import { StepActions } from "./step-actions";
import { TestRows } from "./test-rows";
import { PhotoStrip } from "./photo-strip";
import { PaymentStep, type InvoiceView } from "./payment-step";
import { ShipStep } from "./ship-step";
import type { Address } from "@/lib/address";

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
  payment: { amount: number | null; invoice: InvoiceView | null };
  tests: { attempt: number; passed: TestKind[]; previousFails: { attempt: number; kind: TestKind; note: string | null }[] };
  ship: { carrier: string; tracking: string; labelUrl: string; shipTo: Address | null; everett: boolean; email: string | null; shippedEmailAt: string | null };
  slackChannel: string | null;
  slack: { postedAt: string; by: string; body: string; replies: number; lastReply: string | null; failed: string | null; repliesError: string | null } | null;
  /** Bench photos so far, for the Inspect step's strip. */
  benchPhotos: { id: string; path: string }[];
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
    return d ? [`${formatDate(d.toISOString())} · ${formatTime(d)}`, text].filter(Boolean).join(" · ") : text;
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

      {noteSpec && p.stage !== "test" && (p.stage !== "supply" || (answer === false && !p.slack)) ? (
        <label className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">{noteSpec.label}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={blurNotes}
            disabled={!p.canAct}
            rows={4}
            placeholder={noteSpec.placeholder}
            className={cn("w-full resize-y rounded-xs border border-border-strong bg-transparent px-3.5 py-3 text-[15px] leading-[1.6] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none", p.stage === "repair" ? "min-h-[110px]" : "min-h-24")}
          />
        </label>
      ) : null}


      {p.stage === "inspect" ? (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Photos from the bench</span>
          <PhotoStrip number={p.number} kind="bench" photos={p.benchPhotos} canEdit={p.canAct} />
        </div>
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
          repliesError={p.slack.repliesError}
          onEdit={p.canAct && p.stage === "supply" && !editingList ? () => setEditingList(true) : undefined}
          onRepost={p.canAct && !editingList ? post : undefined}
          edit={editingList ? { value: notes, onChange: setNotes, onPost: post, onCancel: () => { setNotes(p.notes); setEditingList(false); }, placeholder: "1× Dial, Sector GMT (black)" } : undefined}
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
        <BigTick on={!!answer} onToggle={() => pickAnswer(!answer)} label="Repair complete" hint={answer ? tickHint("") : "Tick when the work above is done."} disabled={!p.canAct || pending} />
      ) : null}

      {p.stage === "test" ? (
        <>
          {p.tests.attempt > 1 ? (
            <span className="text-[11px] uppercase tracking-label text-amber">
              Attempt {p.tests.attempt} · <span className="normal-case tracking-normal">{p.tests.previousFails.map((f) => `${TEST_LABELS[f.kind]} failed${f.note ? ` (${f.note})` : ""}`).join(" · ")}</span>
            </span>
          ) : null}
          <TestRows
            passed={passed}
            failing={failing}
            failNote={failNote}
            onPass={toggleTest}
            onFailPick={(k) => { setFailing(k); setFailNote(""); }}
            onFailNote={setFailNote}
            onSendBack={() => failing && run(() => failTest(p.number, failing, failNote))}
            disabled={!p.canAct || pending}
          />
          <label className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-label text-ink-3">Test notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={blurNotes}
              disabled={!p.canAct}
              rows={2}
              placeholder="+2 s/d dial up, amplitude 280°. 200 m pass."
              className="min-h-[72px] w-full resize-y rounded-xs border border-border-strong bg-transparent px-3.5 py-3 text-[15px] leading-[1.6] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
            />
          </label>
        </>
      ) : null}

      {p.stage === "payment" ? (
        <PaymentStep
          amount={amount}
          onAmount={setAmount}
          onAmountBlur={() => p.canAct && amount !== (p.payment.amount?.toString() ?? "") && run(() => setPaymentAmount(p.number, amount ? Number(amount) : null))}
          invoice={p.payment.invoice}
          onSendInvoice={() => run(() => sendInvoice(p.number))}
          paid={!!answer}
          onPaidToggle={() => { const v = !answer; setAnswer(v); run(() => setPaymentReceived(p.number, v)); }}
          disabled={!p.canAct || pending}
        />
      ) : null}

      {p.stage === "ship" ? (
        <ShipStep
          name={p.customer}
          shipTo={p.ship.shipTo}
          everett={p.ship.everett}
          onSaveAddress={async (a) => { const r = await updateShipTo(p.number, a); if (!r.ok) setError(r.error); else router.refresh(); return r.ok; }}
          fields={ship}
          onFields={setShip}
          onFieldsBlur={() => p.canAct && (ship.carrier !== p.ship.carrier || ship.tracking !== p.ship.tracking) && run(() => saveShipping(p.number, ship))}
          labelGeneratedAt={null}
          email={p.ship.email}
          shippedEmail={p.ship.shippedEmailAt ? { at: p.ship.shippedEmailAt } : null}
          disabled={!p.canAct || pending}
        />
      ) : null}

      <StepActions
        label={PRIMARY[p.stage]}
        next={next ? STAGE_LABELS[next] : null}
        onPrimary={() => run(() => advanceTicket(p.number))}
        blocked={parked}
        left={left}
        note={parked ? "Parked until Nodus replies." : p.stage === "check_in" ? "Nothing else to fill in here." : p.stage === "ship" ? "Closes the ticket and writes the summary." : p.stage === "test" ? ["a Fail sends the watch back to Repair with the note attached", !p.needsPayment ? "Payment not required, skipped" : null].filter(Boolean).join(" · ") : undefined}
        pending={pending}
        canAct={p.canAct}
        backLabel={prev && !parked ? STAGE_LABELS[prev] : null}
        onBack={() => prev && run(() => sendBack(p.number, prev))}
        extra={
          <>
            {p.stage === "inspect" && answer === false ? (
              <button type="button" disabled={pending || !notes.trim()} onClick={() => run(() => skipToShip(p.number))} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
                <Package size={14} aria-hidden /> Nothing wrong · skip to Ship
              </button>
            ) : null}
            {canOverride ? (
              <button type="button" disabled={pending} onClick={() => run(() => advanceTicket(p.number, { override: true }))} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60">
                <CrownSimple size={14} aria-hidden /> Owner override · ship unpaid
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
