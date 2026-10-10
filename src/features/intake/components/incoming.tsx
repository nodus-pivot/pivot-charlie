"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowsClockwise, CurrencyDollar, GoogleLogo, LockSimple, MagnifyingGlass, ArrowUUpLeft } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import { dismissRow, refreshIncoming, retryMoves } from "../actions";
import type { CatalogWatch, IncomingRow } from "../sheet";
import { TicketForm, draftFromRow, type Draft } from "./ticket-form";

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
  const draft = selected ? (drafts[selected.fingerprint] ?? draftFromRow(selected)) : null;
  function patch(p: Partial<Draft>) {
    if (!selected || !draft) return;
    setDrafts((d) => ({ ...d, [selected.fingerprint]: { ...draft, ...p } }));
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
        {error ? <p role="alert" className="mx-5 mb-2 text-xs text-coral">{error}</p> : null}

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

            <div className="mt-7 flex min-h-0 flex-1 flex-col">
              <TicketForm draft={draft} onPatch={patch} catalog={catalog} brandId={brandId} context={{ kind: "sheet", row: selected, monthTab }} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
