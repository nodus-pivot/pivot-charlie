"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowCounterClockwise, ArrowSquareOut, Microphone } from "@phosphor-icons/react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SoonIcon } from "@/components/ui/soon";
import { Segmented } from "@/components/ui/segmented";
import { CountrySelect } from "@/components/ui/country-select";
import { addressInline, type Address } from "@/lib/address";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addComment, resendEmail, updateTicketDetails, type DetailsInput } from "../actions";
import { PhotoStrip } from "./photo-strip";

export type DossierData = {
  number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  ship_to: Address | null;
  watch: string;
  serial: string | null;
  coverage: "warranty" | "paid" | null;
  received_at: string | null;
  issue: string | null;
  bench_note: string | null;
  photos: { id: string; path: string; kind: "customer" | "bench" }[];
  comments: { id: string; actor: string; date: string; body: string }[];
  /** Customer emails on this ticket, oldest first. */
  emails: { id: string; label: string; date: string; status: "logged" | "sent" | "failed"; error: string | null; to: string; subject: string; body: string; gmailUrl: string | null }[];
  canResend: boolean;
};

type Fields = DetailsInput;

function fieldsFrom(d: DossierData): Fields {
  return {
    customerName: d.customer_name,
    customerEmail: d.customer_email ?? "",
    customerPhone: d.customer_phone ?? "",
    shipTo: {
      line1: d.ship_to?.line1 ?? "",
      line2: d.ship_to?.line2 ?? "",
      city: d.ship_to?.city ?? "",
      state: d.ship_to?.state ?? "",
      postal_code: d.ship_to?.postal_code ?? "",
      country: d.ship_to?.country ?? "US",
    },
    watch: d.watch,
    serial: d.serial ?? "",
    coverage: d.coverage,
  };
}

/**
 * The left column of every ticket page: the facts, the customer's words,
 * and the internal comment thread. At Check in the facts are editable in
 * place and save on blur.
 */
export function Dossier({ data, editable, canComment }: { data: DossierData; editable: boolean; canComment: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(data));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, start] = useTransition();

  function patch(p: Partial<Fields>) {
    setFields((f) => ({ ...f, ...p }));
  }

  function save(next?: Partial<Fields>) {
    const payload = { ...fields, ...next };
    setSaveState("saving");
    setSaveError(null);
    start(async () => {
      const r = await updateTicketDetails(data.number, payload);
      if (!r.ok) {
        setSaveState("error");
        setSaveError(r.error);
        return;
      }
      setSaveState("saved");
      router.refresh();
    });
  }

  const coverageText = fields.coverage === "paid" ? "Out of warranty · paid" : "Warranty";

  return (
    <aside className="flex w-full flex-none flex-col border-b border-rule px-4 pb-8 pt-8 sm:px-8 lg:w-[380px] lg:border-b-0 lg:border-r lg:pl-12 lg:pr-9">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>No. {data.number}</Eyebrow>
        {editable ? (
          <span className={cn("text-[11px] uppercase tracking-label", saveState === "error" ? "text-coral" : saveState === "saving" ? "text-ink-3" : "text-green")}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : ""}
          </span>
        ) : null}
      </div>
      {saveError ? <p role="alert" className="mt-2 text-xs text-coral">{saveError}</p> : null}

      <div className="mt-5 flex flex-1 flex-col">
        <Row label="Customer">
          {editable ? <Text value={fields.customerName} onChange={(v) => patch({ customerName: v })} onBlur={() => save()} /> : <Value>{data.customer_name}</Value>}
        </Row>
        <Row label="Email">
          {editable ? <Text value={fields.customerEmail ?? ""} onChange={(v) => patch({ customerEmail: v })} onBlur={() => save()} placeholder="Missing" type="email" /> : <Value muted={!data.customer_email}>{data.customer_email ?? "Missing"}</Value>}
        </Row>
        {editable || data.customer_phone ? (
          <Row label="Phone">
            {editable ? <Text value={fields.customerPhone ?? ""} onChange={(v) => patch({ customerPhone: v })} onBlur={() => save()} placeholder="Optional" /> : <Value>{data.customer_phone}</Value>}
          </Row>
        ) : null}
        <Row label="Ship to">
          {editable ? (
            <div className="grid gap-1.5">
              <Text value={fields.shipTo.line1 ?? ""} onChange={(v) => patch({ shipTo: { ...fields.shipTo, line1: v } })} onBlur={() => save()} placeholder="Street" />
              <Text value={fields.shipTo.line2 ?? ""} onChange={(v) => patch({ shipTo: { ...fields.shipTo, line2: v } })} onBlur={() => save()} placeholder="Apt, suite" />
              <div className="grid grid-cols-[1fr_56px_72px] gap-1.5">
                <Text value={fields.shipTo.city ?? ""} onChange={(v) => patch({ shipTo: { ...fields.shipTo, city: v } })} onBlur={() => save()} placeholder="City" />
                <Text value={fields.shipTo.state ?? ""} onChange={(v) => patch({ shipTo: { ...fields.shipTo, state: v } })} onBlur={() => save()} placeholder="ST" />
                <Text value={fields.shipTo.postal_code ?? ""} onChange={(v) => patch({ shipTo: { ...fields.shipTo, postal_code: v } })} onBlur={() => save()} placeholder="ZIP" />
              </div>
              <CountrySelect value={fields.shipTo.country ?? ""} onChange={(v) => { patch({ shipTo: { ...fields.shipTo, country: v } }); save({ shipTo: { ...fields.shipTo, country: v } }); }} className="h-7 w-full text-base text-ink" />
            </div>
          ) : (
            <Value muted={!data.ship_to}>{data.ship_to ? addressInline(data.ship_to) : "No address yet"}</Value>
          )}
        </Row>
        <Row label="Watch">
          {editable ? <Text value={fields.watch} onChange={(v) => patch({ watch: v })} onBlur={() => save()} placeholder="Model" /> : <Value>{data.watch}</Value>}
        </Row>
        <Row label="Serial">
          {editable ? <Text value={fields.serial ?? ""} onChange={(v) => patch({ serial: v })} onBlur={() => save()} placeholder="Optional" mono /> : <Value mono muted={!data.serial}>{data.serial ?? "—"}</Value>}
        </Row>
        <Row label="Coverage" trailing={editable ? <Segmented size="sm" value={fields.coverage} options={[{ value: "warranty", label: "Warranty" }, { value: "paid", label: "Paid" }]} onChange={(v) => { patch({ coverage: v }); save({ coverage: v }); }} aria-label="Coverage" /> : undefined}>
          <Value>{coverageText}</Value>
        </Row>
        {data.received_at ? (
          <Row label="Received">
            <Value>{formatDate(data.received_at)}</Value>
          </Row>
        ) : null}
        <Row label="Customer said">
          <p className="text-sm leading-relaxed text-ink-2">{data.issue || <span className="text-ink-3">Nothing recorded.</span>}</p>
          <PhotoStrip number={data.number} kind="customer" photos={data.photos.filter((p) => p.kind === "customer")} canEdit={canComment} />
        </Row>
        {canComment || data.photos.some((p) => p.kind === "bench") ? (
          <Row label="From the bench">
            <PhotoStrip number={data.number} kind="bench" photos={data.photos.filter((p) => p.kind === "bench")} canEdit={canComment} />
          </Row>
        ) : null}
        {data.bench_note ? (
          <Row label="Note to the bench">
            <p className="text-sm leading-relaxed text-ink-2">{data.bench_note}</p>
          </Row>
        ) : null}

        {data.emails.length ? (
          <Row label="Emails to the customer">
            <ul className="flex flex-col gap-1.5">
              {data.emails.map((e) => (
                <EmailLine key={e.id} number={data.number} email={e} canResend={data.canResend} />
              ))}
            </ul>
          </Row>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 border-t border-rule pt-3.5">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Comments · <span className="normal-case tracking-normal">internal</span></span>
          {data.comments.length === 0 ? <p className="text-xs text-ink-3">No comments yet.</p> : null}
          {data.comments.map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5">
              <span className="text-xs text-ink-3"><span className="text-ink-2">{c.actor}</span> · {c.date}</span>
              <span className="text-sm text-ink-2">{c.body}</span>
            </div>
          ))}
          {canComment ? <Composer number={data.number} /> : null}
        </div>
      </div>
    </aside>
  );
}

/** One email on the ticket. Click the line to read it: to, when, subject, the text as sent, and Open in Gmail for the real thing. */
function EmailLine({ number, email, canResend }: { number: string; email: DossierData["emails"][number]; canResend: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tone = email.status === "sent" ? "text-green" : email.status === "failed" ? "text-coral" : "text-ink-3";
  const word = email.status === "sent" ? "sent" : email.status === "failed" ? "failed" : "logged";
  return (
    <li className="flex flex-col gap-1 text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-wrap items-baseline gap-x-2 text-left">
        <span className="text-ink-2 underline-offset-2 hover:underline">{email.label}</span>
        <span className="text-xs text-ink-3">{email.date.split(" · ")[0]}</span>
        <span className={cn("text-xs", tone)}>{word}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-xs border border-rule bg-panel px-3 py-2.5 text-xs">
          <div className="flex flex-col gap-0.5 text-ink-3">
            <span><span className="text-ink-2">To</span> {email.to}</span>
            <span><span className="text-ink-2">{email.status === "sent" ? "Sent" : "Written"}</span> {email.date}</span>
            <span><span className="text-ink-2">Subject</span> {email.subject}</span>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{email.body}</pre>
          {email.status === "failed" && email.error ? <span className="text-coral">{email.error}</span> : null}
          <span className="flex flex-wrap items-center gap-3">
            {email.gmailUrl ? (
              <a href={email.gmailUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-ink">
                <ArrowSquareOut size={12} aria-hidden /> Open in Gmail
              </a>
            ) : null}
            {canResend && email.status !== "sent" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => { setError(null); start(async () => { const r = await resendEmail(number, email.id); if (!r.ok) setError(r.error); else router.refresh(); }); }}
                className="inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
              >
                <ArrowCounterClockwise size={12} aria-hidden /> {pending ? "Sending…" : "Send again"}
              </button>
            ) : null}
          </span>
          {error ? <span role="alert" className="text-coral">{error}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

function Composer({ number }: { number: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit() {
    if (!body.trim()) return;
    setError(null);
    start(async () => {
      const r = await addComment(number, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }
  return (
    <form
      className="mt-auto flex flex-col gap-1 pt-4"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <label className="flex h-10 items-center justify-between gap-2 border-b border-border-strong text-sm text-ink-3 focus-within:border-gold">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment"
          disabled={pending}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          aria-label="Add a comment"
        />
        <SoonIcon hint="Dictation"><Microphone size={15} /></SoonIcon>
      </label>
      {error ? <p className="text-xs text-coral">{error}</p> : null}
      <p className="text-[11px] text-ink-3">Enter to post</p>
    </form>
  );
}

function Row({ label, trailing, children }: { label: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-rule py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function Value({ children, mono, muted }: { children: ReactNode; mono?: boolean; muted?: boolean }) {
  return <span className={cn("text-base", mono && "font-mono", muted ? "text-ink-3" : "text-ink")}>{children}</span>;
}

function Text({ value, onChange, onBlur, placeholder, type = "text", mono }: { value: string; onChange: (v: string) => void; onBlur: () => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={cn("w-full border-b border-transparent bg-transparent text-base text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-rule focus:border-gold focus-visible:outline-none", mono && "font-mono")}
    />
  );
}
