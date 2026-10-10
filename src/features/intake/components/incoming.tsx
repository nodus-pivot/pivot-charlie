"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowsClockwise, CurrencyDollar, GoogleLogo, Info, Lightning, LockSimple, MagnifyingGlass, ArrowUUpLeft } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Segmented, ToggleChip } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { createTicket, dismissRow, refreshIncoming, retryMoves } from "../actions";
import type { CatalogWatch, IncomingRow } from "../sheet";

type Props = {
  rows: IncomingRow[];
  catalog: CatalogWatch[];
  brandId: string;
  brandName: string;
  syncedAt: string;
  stale: boolean;
  pendingMoves: { id: string; name: string; status: "imported" | "dismissed" }[];
  monthTab: string;
  initialSelected?: string;
};

type Filter = "all" | "missing" | "payment" | "model";
type Draft = {
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
  issue: string;
  benchNote: string;
};

function draftFor(r: IncomingRow): Draft {
  return {
    customerName: r.name,
    customerEmail: r.email,
    customerPhone: "",
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
    benchNote: "",
  };
}

function missingFor(d: Draft): string[] {
  const m: string[] = [];
  if (!d.customerName.trim()) m.push("name");
  if (!/\S+@\S+\.\S+/.test(d.customerEmail)) m.push("email");
  if (!d.watchId) m.push("pick a catalog model");
  if (!d.issue.trim()) m.push("what they said");
  return m;
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function IncomingView({ rows, catalog, brandId, brandName, syncedAt, stale, pendingMoves, monthTab, initialSelected }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [selectedFp, setSelectedFp] = useState<string | null>(initialSelected ?? rows[0]?.fingerprint ?? null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(
    () => ({
      all: rows.length,
      missing: rows.filter((r) => !r.hasEmail || !r.hasAddress).length,
      payment: rows.filter((r) => r.needsPayment).length,
      model: rows.filter((r) => r.model.kind === "none").length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "missing" && r.hasEmail && r.hasAddress) return false;
      if (filter === "payment" && !r.needsPayment) return false;
      if (filter === "model" && r.model.kind !== "none") return false;
      if (q && !`${r.name} ${r.fields.model} ${r.issue}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const key = (r: IncomingRow) => r.dateIso ?? "9999";
    return list.sort((a, b) => (sort === "oldest" ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))) || a.row - b.row);
  }, [rows, filter, query, sort]);

  const selected = rows.find((r) => r.fingerprint === selectedFp) ?? null;
  const draft = selected ? (drafts[selected.fingerprint] ?? draftFor(selected)) : null;
  function patch(p: Partial<Draft>) {
    if (!selected || !draft) return;
    setDrafts((d) => ({ ...d, [selected.fingerprint]: { ...draft, ...p } }));
  }

  const watch = catalog.find((w) => w.id === draft?.watchId) ?? null;
  const missing = draft ? missingFor(draft) : [];

  function submitCreate() {
    if (!selected || !draft) return;
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
        modelText: selected.fields.model,
        serial: draft.serial,
        issue: draft.issue,
        benchNote: draft.benchNote,
        coverage: draft.coverage,
        priority: draft.priority,
        needsPayment: draft.needsPayment,
        paymentAmount: draft.paymentAmount ? Number(draft.paymentAmount) : null,
        returnToEverett: draft.returnToEverett,
        onBench: false,
        claimRef: selected.claimRef,
        sheet: { fingerprint: selected.fingerprint, raw: selected.raw },
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

  function retryPending() {
    setError(null);
    start(async () => {
      const r = await retryMoves();
      if (!r.ok) setError(r.error);
      else setNotice(r.failed.length ? `${r.finished} moved; still failing: ${r.failed.join("; ")}` : `${r.finished} row${r.finished === 1 ? "" : "s"} moved in the sheet.`);
      router.refresh();
    });
  }

  function submitDismiss() {
    if (!selected) return;
    setError(null);
    start(async () => {
      let r: Awaited<ReturnType<typeof dismissRow>>;
      try {
        r = await dismissRow({ fingerprint: selected.fingerprint, raw: selected.raw, reason });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return;
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(r.moveError ? `Dismissed in Pivot, but the sheet move failed: ${r.moveError}` : `${selected.name} moved to Archive.`);
      setDismissing(false);
      setReason("");
      const next = shown.find((x) => x.fingerprint !== selected.fingerprint);
      setSelectedFp(next?.fingerprint ?? null);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* ---------------------------------------------------------------- queue */}
      <aside className="flex w-full flex-none flex-col border-b border-rule bg-panel lg:min-h-0 lg:w-[440px] lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-3.5 px-5 pb-3.5 pt-7">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>Incoming · {brandName}</Eyebrow>
            <Link href="/service-center" className="flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-3 hover:text-ink-2">
              <ArrowLeft size={12} aria-hidden /> My bench
            </Link>
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[34px] leading-none font-semibold tracking-[-0.02em] text-ink">Incoming watches</h1>
            <span className="font-mono text-[13px] text-ink-3">{rows.length}</span>
          </div>
          <form action={refreshIncoming} className="flex items-center gap-3">
            <span className={cn("flex items-center gap-1.5 text-[11px] uppercase tracking-label", stale ? "text-amber" : "text-green")}>
              <GoogleLogo size={12} aria-hidden />
              {stale ? "Sheet unreachable · showing" : "Sheet synced"} {timeFmt.format(new Date(syncedAt))}
            </span>
            <button type="submit" className="flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-3 hover:text-ink-2" title="Read the sheet again">
              <ArrowsClockwise size={12} aria-hidden /> Refresh
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All"],
                ["missing", "Missing info"],
                ["payment", "Payment"],
                ["model", "Model unknown"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                aria-pressed={filter === k}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs leading-none transition-colors",
                  filter === k ? "border-gold-light bg-gold/12 text-gold-light" : "border-border-strong text-ink-3 hover:border-gold hover:text-ink-2",
                )}
              >
                {label} {counts[k]}
              </button>
            ))}
          </div>
          <label className="flex h-9 items-center gap-2 border-b border-border-strong text-[13px] text-ink-3 focus-within:border-gold">
            <MagnifyingGlass size={14} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, model, issue" className="w-full bg-transparent text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none" />
            <select value={sort} onChange={(e) => setSort(e.target.value as "oldest" | "newest")} aria-label="Sort" className="bg-transparent text-xs text-ink-3 outline-none [&>option]:bg-panel">
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>

        {pendingMoves.length ? (
          <div className="mx-5 mb-2 flex items-center justify-between gap-3 border border-amber/50 bg-amber/10 px-3 py-2 text-xs text-amber">
            <span>
              {pendingMoves.length} row{pendingMoves.length === 1 ? "" : "s"} handled in Pivot but not yet moved in the sheet ({pendingMoves.map((p) => p.name).join(", ")}).
            </span>
            <button type="button" disabled={pending} onClick={retryPending} className="whitespace-nowrap underline-offset-2 hover:underline">Retry</button>
          </div>
        ) : null}
        {notice ? <p className="mx-5 mb-2 text-xs text-green">{notice}</p> : null}

        <ul className="flex max-h-[40vh] min-h-0 flex-col overflow-y-auto lg:max-h-none lg:flex-1">
          {shown.length === 0 ? <li className="px-5 py-8 text-sm text-ink-3">{rows.length ? "Nothing matches." : "The queue is empty."}</li> : null}
          {shown.map((r) => {
            const active = r.fingerprint === selectedFp;
            return (
              <li key={r.fingerprint}>
                <button
                  type="button"
                  onClick={() => { setSelectedFp(r.fingerprint); setDismissing(false); setError(null); }}
                  aria-current={active ? "true" : undefined}
                  className={cn("flex w-full flex-col gap-1.5 border-t border-rule px-5 py-3.5 text-left transition-colors hover:bg-ground/40", active && "border-l-2 border-l-gold bg-gold/12 pl-[18px]")}
                >
                  <span className="flex w-full items-baseline gap-2.5">
                    <span className="truncate font-display text-xl font-semibold text-ink">{r.name || "No name"}</span>
                    <span className="truncate text-[13px] text-ink-3">{r.fields.model}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{r.fields.date || "no date"}</span>
                  </span>
                  <span className="w-full truncate text-[13px] text-ink-2">{r.issue || "No issue text"}</span>
                  <span className="flex flex-wrap gap-1">
                    {r.model.kind === "none" ? <Chip tone="amber">Model not in catalog</Chip> : r.model.kind === "fuzzy" ? <Chip tone="amber">Model ≈ {r.model.watch.name}</Chip> : null}
                    {!r.hasEmail ? <Chip tone="amber">No email</Chip> : null}
                    {!r.hasAddress ? <Chip tone="amber">No address</Chip> : null}
                    {r.needsPayment ? <Chip tone="coral"><CurrencyDollar size={11} /> Payment</Chip> : null}
                    {r.returnToEverett ? <Chip tone="neutral"><ArrowUUpLeft size={11} /> To Everett</Chip> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule px-5 py-3.5">
          <ButtonLink href="/service-center/tickets/new" variant="primary" size="sm">New ticket by hand</ButtonLink>
          <span className="text-xs text-ink-3">Rows come from the website form</span>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- review pane */}
      <section className="flex min-w-0 flex-1 flex-col px-4 pb-8 pt-9 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:pl-[52px] lg:pr-12">
        {!selected || !draft ? (
          <p className="text-sm text-ink-3">Pick a row on the left to review it.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Eyebrow>
                Sheet row {selected.row} · {selected.fields.date || "no date"} · website form
              </Eyebrow>
              <span className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 text-xs text-ink-3 sm:inline-flex">
                  <LockSimple size={13} aria-hidden /> Edits save to the ticket, not the sheet
                </span>
                <Button size="sm" onClick={() => { setDismissing((d) => !d); setError(null); }} aria-expanded={dismissing}>
                  Dismiss row
                </Button>
              </span>
            </div>

            {dismissing ? (
              <div className="mt-4 flex flex-col gap-3 border border-rule bg-panel p-4 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-2 text-[11px] uppercase tracking-label text-ink-3">
                  Why is this row being dismissed?
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate, spam, handled elsewhere…" className="h-9 border-b border-border-strong bg-transparent text-[15px] normal-case tracking-normal text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none" />
                </label>
                <Button size="sm" variant="ghost" onClick={() => setDismissing(false)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={pending || reason.trim().length < 3} onClick={submitDismiss}>
                  {pending ? "Moving…" : "Move to Archive"}
                </Button>
              </div>
            ) : null}

            <div className="mt-6">
              <h1 className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[56px]">{draft.customerName || selected.name || "No name"}</h1>
              <p className="mt-3 text-lg text-ink-2">
                {selected.fields.model || "No model"} ·{" "}
                {selected.model.kind === "exact" ? <span className="text-green">in catalog</span> : selected.model.kind === "fuzzy" ? <span className="text-amber">looks like {selected.model.watch.name}</span> : <span className="text-amber">model not in catalog</span>}
              </p>
            </div>

            <div className="mt-7 grid gap-x-14 lg:grid-cols-2">
              <div>
                <FieldRow label="Customer" source="Name">
                  <TextInput value={draft.customerName} onChange={(v) => patch({ customerName: v })} placeholder="Full name" />
                </FieldRow>
                <FieldRow label="Email" source="Email">
                  <TextInput value={draft.customerEmail} onChange={(v) => patch({ customerEmail: v })} placeholder="Missing on the form" type="email" />
                </FieldRow>
                <FieldRow label="Phone">
                  <TextInput value={draft.customerPhone} onChange={(v) => patch({ customerPhone: v })} placeholder="Not on the form" />
                </FieldRow>
                <FieldRow label="Ship to" source="Address · City · State · Zip · Country">
                  <div className="grid gap-2">
                    <TextInput value={draft.line1} onChange={(v) => patch({ line1: v })} placeholder="Street" />
                    <TextInput value={draft.line2} onChange={(v) => patch({ line2: v })} placeholder="Apt, suite (optional)" />
                    <div className="grid grid-cols-[1fr_72px_96px_64px] gap-2">
                      <TextInput value={draft.city} onChange={(v) => patch({ city: v })} placeholder="City" />
                      <TextInput value={draft.state} onChange={(v) => patch({ state: v })} placeholder="State" />
                      <TextInput value={draft.postal_code} onChange={(v) => patch({ postal_code: v })} placeholder="Zip" />
                      <TextInput value={draft.country} onChange={(v) => patch({ country: v })} placeholder="US" />
                    </div>
                  </div>
                </FieldRow>
              </div>
              <div>
                <FieldRow
                  label="Watch"
                  source="Model"
                  trailing={selected.model.kind === "none" ? <Chip tone="amber">Not in catalog</Chip> : selected.model.kind === "fuzzy" ? <Chip tone="amber">Best guess</Chip> : <Chip tone="green">In catalog</Chip>}
                >
                  <span className="flex flex-wrap items-center gap-2.5 text-[17px] text-ink">
                    <span className="truncate">{selected.fields.model || "—"}</span>
                    <ArrowRight size={14} className="text-ink-3" aria-hidden />
                    <select
                      value={draft.watchId}
                      onChange={(e) => patch({ watchId: e.target.value })}
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
                <FieldRow label="Serial" source="Serial Number">
                  <TextInput value={draft.serial} onChange={(v) => patch({ serial: v })} placeholder="Optional" mono />
                </FieldRow>
                <FieldRow label="Coverage" trailing={<Segmented value={draft.coverage} options={[{ value: "warranty", label: "Warranty" }, { value: "paid", label: "Paid" }]} onChange={(v) => patch({ coverage: v, needsPayment: v === "paid" ? true : draft.needsPayment })} aria-label="Coverage" />}>
                  <span className="text-[17px] text-ink">
                    {draft.coverage === "paid" ? "Paid repair" : "Warranty"}
                    {draft.coverage !== "paid" && watch?.warranty_months ? ` · ${watch.warranty_months} mo` : ""}
                  </span>
                  <span className="text-xs text-ink-3">
                    Sheet says Payment Required = {selected.fields.paymentRequired || "blank"}
                    {selected.paymentAmount !== null ? ` · $${selected.paymentAmount} in the issue text` : ""}
                  </span>
                </FieldRow>
                <FieldRow label="Flags">
                  <span className="flex flex-wrap items-center gap-2">
                    <ToggleChip on={draft.priority} onChange={(v) => patch({ priority: v })} tone="coral"><Lightning size={11} /> Priority</ToggleChip>
                    <ToggleChip on={draft.needsPayment} onChange={(v) => patch({ needsPayment: v })}><CurrencyDollar size={11} /> Needs payment</ToggleChip>
                    {draft.needsPayment ? (
                      <input value={draft.paymentAmount} onChange={(e) => patch({ paymentAmount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="$" inputMode="decimal" className="h-7 w-20 border-b border-border-strong bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none" aria-label="Amount" />
                    ) : null}
                    <ToggleChip on={draft.returnToEverett} onChange={(v) => patch({ returnToEverett: v })}><ArrowUUpLeft size={11} /> Return to Everett</ToggleChip>
                  </span>
                </FieldRow>
              </div>
            </div>

            <FieldRow label="What the customer said" source="Issue">
              <textarea value={draft.issue} onChange={(e) => patch({ issue: e.target.value })} rows={3} className="w-full resize-y bg-transparent text-[17px] leading-[1.45] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none" placeholder="In their words" />
              {selected.claimRef ? <span className="font-mono text-xs text-ink-3">Claim {selected.claimRef}</span> : null}
            </FieldRow>
            <FieldRow label="Note to the bench">
              <textarea value={draft.benchNote} onChange={(e) => patch({ benchNote: e.target.value })} rows={2} className="w-full resize-y bg-transparent text-[17px] leading-[1.45] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none" placeholder="Anything the watchmaker should know" />
            </FieldRow>

            <div className="mt-auto flex flex-col gap-3 pt-10">
              {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="primary" disabled={pending || missing.length > 0} onClick={submitCreate}>
                  {pending ? "Creating…" : "Create ticket"} <ArrowRight size={14} />
                </Button>
                {missing.length ? (
                  <span className="text-[13px] text-ink-2">
                    <span className="text-gold-light">{missing.length} left:</span> {missing.join(", ")}
                  </span>
                ) : (
                  <span className="text-[13px] text-ink-2">Opens on Check in.</span>
                )}
              </div>
              <p className="flex items-start gap-2 text-[13px] text-ink-3">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  Creating moves the row from <span className="font-mono">Incoming Watches</span> to <span className="font-mono">{monthTab}</span> as it was, and opens the ticket on Check in. Your edits live only on the ticket.
                </span>
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FieldRow({ label, source, trailing, children }: { label: string; source?: string; trailing?: ReactNode; children: ReactNode }) {
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
      className={cn("w-full border-b border-transparent bg-transparent text-[17px] leading-[1.45] text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-rule focus:border-gold focus-visible:outline-none", mono && "font-mono")}
    />
  );
}
