"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ArrowRight, ArrowUUpLeft, Camera, Check, CurrencyDollar, Info, Lightning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented, ToggleChip } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { createTicket } from "../actions";
import type { CatalogWatch, IncomingRow } from "../sheet";

/**
 * The ticket fields, shared by Incoming (prefilled from a sheet row, with
 * the "← Name" source hints) and New ticket by hand (blank). The parent
 * owns the draft so Incoming can keep one per row; this component renders,
 * validates and creates.
 */

export type Draft = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  watchId: string;
  serial: string;
  coverage: "warranty" | "paid" | null;
  priority: boolean;
  needsPayment: boolean;
  paymentAmount: string;
  returnToEverett: boolean;
  onBench: boolean;
  issue: string;
  benchNote: string;
};

export const EMPTY_DRAFT: Draft = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  watchId: "",
  serial: "",
  coverage: "warranty",
  priority: false,
  needsPayment: false,
  paymentAmount: "",
  returnToEverett: false,
  onBench: false,
  issue: "",
  benchNote: "",
};

export function draftFromRow(r: IncomingRow): Draft {
  return {
    ...EMPTY_DRAFT,
    customerName: r.name,
    customerEmail: r.email,
    line1: r.address.line1,
    line2: r.address.line2,
    city: r.address.city,
    state: r.address.state,
    postal_code: r.address.postal_code,
    country: r.address.country,
    watchId: r.model.kind === "none" ? "" : r.model.watch.id,
    serial: r.fields.serial,
    coverage: r.needsPayment ? "paid" : "warranty",
    priority: /priority/i.test(r.issue),
    needsPayment: r.needsPayment,
    paymentAmount: r.paymentAmount?.toString() ?? "",
    returnToEverett: r.returnToEverett,
    issue: r.issue,
  };
}

export function missingFor(d: Draft): string[] {
  const m: string[] = [];
  if (!d.customerName.trim()) m.push("name");
  if (!/\S+@\S+\.\S+/.test(d.customerEmail)) m.push("email");
  if (!d.watchId) m.push("watch");
  if (!d.issue.trim()) m.push("what they said");
  return m;
}

export type FormContext = { kind: "sheet"; row: IncomingRow; monthTab: string } | { kind: "hand" };

type Props = {
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
  catalog: CatalogWatch[];
  brandId: string;
  context: FormContext;
};

export function TicketForm({ draft, onPatch, catalog, brandId, context }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sheet = context.kind === "sheet" ? context.row : null;
  const watch = catalog.find((w) => w.id === draft.watchId) ?? null;
  const missing = missingFor(draft);
  const src = (s: string) => (sheet ? s : undefined);

  function submit() {
    setError(null);
    start(async () => {
      let r: Awaited<ReturnType<typeof createTicket>>;
      try {
        r = await createTicket({
          brandId,
          watchId: draft.watchId,
          customerName: draft.customerName,
          customerEmail: draft.customerEmail,
          customerPhone: draft.customerPhone,
          shipTo: { line1: draft.line1, line2: draft.line2, city: draft.city, state: draft.state, postal_code: draft.postal_code, country: draft.country },
          modelText: sheet?.fields.model ?? null,
          serial: draft.serial,
          issue: draft.issue,
          benchNote: draft.benchNote,
          coverage: draft.coverage,
          priority: draft.priority,
          needsPayment: draft.needsPayment,
          paymentAmount: draft.paymentAmount ? Number(draft.paymentAmount) : null,
          returnToEverett: draft.returnToEverett,
          onBench: draft.onBench,
          claimRef: sheet?.claimRef ?? null,
          sheet: sheet ? { fingerprint: sheet.fingerprint, raw: sheet.raw } : null,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return;
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/service-center/tickets/${r.number}${r.moveError ? "?move=failed" : ""}`);
    });
  }

  return (
    <>
      <div className="grid gap-x-14 lg:grid-cols-2">
        <div>
          <FieldRow label="Customer" source={src("Name")}>
            <TextInput value={draft.customerName} onChange={(v) => onPatch({ customerName: v })} placeholder="Full name" />
          </FieldRow>
          <FieldRow label="Email" source={src("Email")}>
            <TextInput value={draft.customerEmail} onChange={(v) => onPatch({ customerEmail: v })} placeholder={sheet ? "Missing on the form" : "name@example.com"} type="email" />
          </FieldRow>
          <FieldRow label="Phone">
            <TextInput value={draft.customerPhone} onChange={(v) => onPatch({ customerPhone: v })} placeholder={sheet ? "Not on the form" : "Optional"} />
          </FieldRow>
          <FieldRow label={sheet ? "Ship to" : "Return address"} source={src("Address · City · State · Zip · Country")}>
            <div className="grid gap-2">
              <TextInput value={draft.line1} onChange={(v) => onPatch({ line1: v })} placeholder="Street" />
              <TextInput value={draft.line2} onChange={(v) => onPatch({ line2: v })} placeholder="Apt, suite (optional)" />
              <div className="grid grid-cols-[1fr_72px_96px_64px] gap-2">
                <TextInput value={draft.city} onChange={(v) => onPatch({ city: v })} placeholder="City" />
                <TextInput value={draft.state} onChange={(v) => onPatch({ state: v })} placeholder="State" />
                <TextInput value={draft.postal_code} onChange={(v) => onPatch({ postal_code: v })} placeholder="ZIP" />
                <TextInput value={draft.country} onChange={(v) => onPatch({ country: v })} placeholder="US" />
              </div>
            </div>
          </FieldRow>
        </div>
        <div>
          <FieldRow
            label="Watch"
            source={src("Model")}
            trailing={
              sheet ? (
                sheet.model.kind === "none" ? <Chip tone="amber">Not in catalog</Chip> : sheet.model.kind === "fuzzy" ? <Chip tone="amber">Best guess</Chip> : <Chip tone="green">In catalog</Chip>
              ) : null
            }
          >
            <span className="flex flex-wrap items-center gap-2.5 text-[17px] text-ink">
              {sheet ? (
                <>
                  <span className="truncate">{sheet.fields.model || "—"}</span>
                  <ArrowRight size={14} className="text-ink-3" aria-hidden />
                </>
              ) : null}
              <select
                value={draft.watchId}
                onChange={(e) => onPatch({ watchId: e.target.value })}
                className={cn("bg-transparent text-[17px] outline-none [&>option]:bg-panel", draft.watchId ? "text-ink" : "text-gold-light")}
                aria-label="Catalog model"
              >
                <option value="">Pick a model ▾</option>
                {catalog.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </span>
          </FieldRow>
          <FieldRow label="Serial" source={src("Serial Number")}>
            <TextInput value={draft.serial} onChange={(v) => onPatch({ serial: v })} placeholder="Optional" mono />
          </FieldRow>
          <FieldRow
            label="Coverage"
            trailing={
              <Segmented
                value={draft.coverage}
                options={[{ value: "warranty", label: "Warranty" }, { value: "paid", label: "Paid" }]}
                onChange={(v) => onPatch({ coverage: v, needsPayment: v === "paid" ? true : draft.needsPayment })}
                aria-label="Coverage"
              />
            }
          >
            <span className="text-[17px] text-ink">
              {draft.coverage === "paid" ? "Paid repair" : watch ? `Warranty${watch.warranty_months ? ` · ${watch.warranty_months} mo` : ""}` : <span className="text-ink-3">Set by the model</span>}
            </span>
            {sheet ? (
              <span className="text-xs text-ink-3">
                Sheet says Payment Required = {sheet.fields.paymentRequired || "blank"}
                {sheet.paymentAmount !== null ? ` · $${sheet.paymentAmount} in the issue text` : ""}
              </span>
            ) : null}
          </FieldRow>
          <FieldRow label="Flags">
            <span className="flex flex-wrap items-center gap-2">
              <ToggleChip on={draft.priority} onChange={(v) => onPatch({ priority: v })} tone="coral"><Lightning size={11} /> Priority</ToggleChip>
              <ToggleChip on={draft.needsPayment} onChange={(v) => onPatch({ needsPayment: v })}><CurrencyDollar size={11} /> Needs payment</ToggleChip>
              {draft.needsPayment ? (
                <input
                  value={draft.paymentAmount}
                  onChange={(e) => onPatch({ paymentAmount: e.target.value.replace(/[^\d.]/g, "") })}
                  placeholder="$"
                  inputMode="decimal"
                  className="h-7 w-20 border-b border-border-strong bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
                  aria-label="Amount"
                />
              ) : null}
              <ToggleChip on={draft.returnToEverett} onChange={(v) => onPatch({ returnToEverett: v })}><ArrowUUpLeft size={11} /> Return to Everett</ToggleChip>
              {!sheet ? (
                <ToggleChip on={draft.onBench} onChange={(v) => onPatch({ onBench: v })}><Check size={11} /> Watch is already on the bench</ToggleChip>
              ) : null}
            </span>
          </FieldRow>
        </div>
      </div>

      <FieldRow label="What the customer said" source={src("Issue")}>
        <textarea
          value={draft.issue}
          onChange={(e) => onPatch({ issue: e.target.value })}
          rows={3}
          className="w-full resize-y bg-transparent text-[17px] leading-[1.45] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          placeholder="In their words"
        />
        {sheet?.claimRef ? <span className="font-mono text-xs text-ink-3">Claim {sheet.claimRef}</span> : null}
        {!sheet ? (
          <div className="mt-1 flex gap-2" aria-label="Customer photos, coming soon">
            {[0, 1, 2].map((i) => (
              <span key={i} className="grid size-16 place-items-center rounded-xs border border-dashed border-border-strong text-border-strong" title="Photo uploads arrive in a later round">
                <Camera size={18} />
              </span>
            ))}
          </div>
        ) : null}
      </FieldRow>
      <FieldRow label="Note to the bench">
        <textarea
          value={draft.benchNote}
          onChange={(e) => onPatch({ benchNote: e.target.value })}
          rows={2}
          className="w-full resize-y bg-transparent text-[17px] leading-[1.45] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          placeholder="Anything the watchmaker should know"
        />
      </FieldRow>

      <div className="mt-auto flex flex-col gap-3 pt-10">
        {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" disabled={pending || missing.length > 0} onClick={submit}>
            {pending ? "Creating…" : "Create ticket"} <ArrowRight size={14} />
          </Button>
          <span className="text-[13px] text-ink-2">
            {missing.length ? (
              <>
                <span className="text-gold-light">{missing.length} left:</span> {missing.join(", ")} · opens on Check in
              </>
            ) : (
              "Opens on Check in."
            )}
          </span>
        </div>
        {context.kind === "sheet" ? (
          <p className="flex items-start gap-2 text-[13px] text-ink-3">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Creating moves the row from <span className="font-mono">Incoming Watches</span> to <span className="font-mono">{context.monthTab}</span> as it was, and opens the ticket on Check in. Your edits live only on the ticket.
            </span>
          </p>
        ) : null}
      </div>
    </>
  );
}

export function FieldRow({ label, source, trailing, children }: { label: string; source?: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-rule py-4">
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
        {source ? <span className="font-mono text-[11px] text-ink-3">← {source}</span> : null}
        {trailing ? <span className="ml-auto">{trailing}</span> : null}
      </div>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", mono }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full border-b border-transparent bg-transparent text-[17px] leading-[1.45] text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-rule focus:border-gold focus-visible:outline-none",
        mono && "font-mono",
      )}
    />
  );
}
