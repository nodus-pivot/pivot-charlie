"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, Check, CheckCircle, Info, Package, PaperPlaneTilt, Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { COMPONENT_LABELS, type Component } from "@/features/pipeline";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addSparePart, advanceTicket, markPartArrived, removeSparePart, requestParts, saveStageNote, sendBack, setPartHave } from "../actions";
import type { FitPart } from "../detail";

export type SupplyRow = {
  id: string;
  findingId: string | null;
  component: Component;
  name: string;
  sku: string;
  label: string | null;
  qty: number;
  haveIt: boolean;
  requestedAt: string | null;
  arrivedAt: string | null;
};

type Props = {
  number: string;
  rows: SupplyRow[];
  fits: FitPart[];
  messages: { date: string; body: string }[];
  note: string;
  brandName: string;
  canAct: boolean;
};

/** S5 / S6: Have it or Need it per part; Message for parts parks the watch; Mark arrived one at a time; Fix unlocks when the last is in. */
export function SupplyStep({ number, rows: initialRows, fits, messages, note, brandName, canAct }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [text, setText] = useState(note);
  const [adding, setAdding] = useState(false);
  const [sparePart, setSparePart] = useState("");
  const [spareLabel, setSpareLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const parked = rows.some((r) => r.requestedAt && !r.haveIt && !r.arrivedAt);
  const requested = rows.some((r) => r.requestedAt);
  const missing = rows.filter((r) => !r.haveIt && !r.arrivedAt);
  const inHand = (r: SupplyRow) => r.haveIt || !!r.arrivedAt;
  const display = (r: SupplyRow) => r.label ?? r.name;

  function patchRow(id: string, p: Partial<SupplyRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function toggleHave(r: SupplyRow, have: boolean) {
    if (!canAct) return;
    setError(null);
    patchRow(r.id, { haveIt: have });
    save(async () => {
      const res = await setPartHave(number, r.id, have);
      if (!res.ok) {
        patchRow(r.id, { haveIt: !have });
        setError(res.error);
      }
    });
  }

  function arrived(r: SupplyRow) {
    setError(null);
    const at = new Date().toISOString();
    patchRow(r.id, { arrivedAt: at });
    save(async () => {
      const res = await markPartArrived(number, r.id);
      if (!res.ok) {
        patchRow(r.id, { arrivedAt: null });
        setError(res.error);
      } else router.refresh();
    });
  }

  function message() {
    setError(null);
    start(async () => {
      const res = await requestParts(number);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toFix() {
    setError(null);
    start(async () => {
      const res = await advanceTicket(number, "fix");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function back() {
    setError(null);
    start(async () => {
      const res = await sendBack(number, "inspect");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function addSpare() {
    const part = fits.find((p) => p.id === sparePart);
    if (!part) return;
    setError(null);
    start(async () => {
      const res = await addSparePart(number, { partId: part.id, label: spareLabel.trim() || `Spare ${part.name.toLowerCase()}`, qty: 1 });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAdding(false);
      setSparePart("");
      setSpareLabel("");
      router.refresh();
    });
  }

  function removeSpare(r: SupplyRow) {
    setError(null);
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    save(async () => {
      const res = await removeSparePart(number, r.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const lastMessage = messages.at(-1);

  return (
    <>
      {requested && lastMessage ? (
        <span className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-3">
          <PaperPlaneTilt size={13} className="text-green" aria-hidden />
          Message sent to {brandName} rep · {lastMessage.date}
          <span className="normal-case tracking-normal text-ink-2">&ldquo;{lastMessage.body}&rdquo;</span>
        </span>
      ) : (
        <span className="text-[11px] uppercase tracking-label text-ink-3">Parts this repair needs · from Inspect</span>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">Inspect planned no replacements. Nothing to source; continue to Fix.</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-3 first:border-t-0">
              {parked ? (
                inHand(r) ? (
                  r.haveIt ? <Check size={16} className="text-green" aria-label="had it" /> : <CheckCircle size={16} className="text-green" aria-label="arrived" />
                ) : (
                  <Package size={16} className="text-amber" aria-label="waiting" />
                )
              ) : (
                <span className="w-[90px] text-[15px] font-medium text-ink">{r.findingId ? COMPONENT_LABELS[r.component] : "Extra"}</span>
              )}
              <span className="min-w-0 flex-1 text-[15px] text-ink-2">
                {r.qty > 1 ? `${r.qty}× ` : ""}
                {display(r)} <span className="font-mono text-xs text-ink-3">{r.sku}</span>
                {r.requestedAt && !inHand(r) ? <span className="ml-2 text-xs text-amber">· requested {formatDate(r.requestedAt)}</span> : null}
              </span>
              {parked ? (
                r.haveIt ? (
                  <span className="text-[13px] text-green">Had it</span>
                ) : r.arrivedAt ? (
                  <span className="text-[13px] text-green">Arrived {formatDate(r.arrivedAt)}</span>
                ) : canAct ? (
                  <Button size="sm" variant="primary" onClick={() => arrived(r)}>Mark arrived</Button>
                ) : (
                  <span className="text-[13px] text-amber">waiting</span>
                )
              ) : (
                <Segmented
                  value={r.haveIt ? "have" : "need"}
                  options={[{ value: "have", label: "Have it" }, { value: "need", label: "Need it" }]}
                  onChange={(v) => toggleHave(r, v === "have")}
                  aria-label={`${display(r)} in hand?`}
                  className={cn(!r.haveIt && "[&_[aria-checked=true]]:bg-amber/14 [&_[aria-checked=true]]:text-amber")}
                />
              )}
              {!r.findingId && canAct && !r.requestedAt ? (
                <button type="button" onClick={() => removeSpare(r)} className="text-ink-3 hover:text-coral" aria-label={`Remove ${display(r)}`}><X size={12} /></button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canAct ? (
        adding ? (
          <div className="flex flex-wrap items-end gap-3 border border-rule bg-panel p-3">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] uppercase tracking-label text-ink-3">
              Part
              <select value={sparePart} onChange={(e) => setSparePart(e.target.value)} className="h-9 border-b border-border-strong bg-transparent text-[15px] normal-case tracking-normal text-ink outline-none focus:border-gold [&>option]:bg-panel" aria-label="Extra part">
                <option value="">Pick a part that fits this watch</option>
                {fits.map((p) => (
                  <option key={p.id} value={p.id}>{COMPONENT_LABELS[p.component]} · {p.name}{p.variant ? ` · ${p.variant}` : ""} — {p.sku}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] uppercase tracking-label text-ink-3">
              Why
              <input value={spareLabel} onChange={(e) => setSpareLabel(e.target.value)} placeholder="Spare bezel insert" className="h-9 border-b border-border-strong bg-transparent text-[15px] normal-case tracking-normal text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none" />
            </label>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={!sparePart || pending} onClick={addSpare}>Add</Button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 self-start text-[13px] text-gold-light hover:text-gold">
            <Plus size={12} /> Add a part beyond the findings
          </button>
        )
      ) : null}

      <p className="flex items-start gap-2 text-[13px] text-ink-3">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        {requested ? "Mark each part as it arrives. Fix unlocks when the last one is in." : "You keep parts at your bench and Pivot doesn't track that stock, so mark what you have in hand."}
      </p>

      <label className="flex h-11 items-center border-b border-border-strong focus-within:border-gold">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => canAct && text !== note && save(async () => { const r = await saveStageNote(number, "supply", text); if (!r.ok) setError(r.error); })}
          disabled={!canAct}
          placeholder="Anything about the parts (size, finish, quantity)"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
          aria-label="Supply note"
        />
      </label>

      {canAct ? (
        <div className="flex flex-col gap-3">
          {!parked && missing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3.5">
              <Button variant="primary" disabled={pending} onClick={message}>
                Message for parts <ArrowRight size={14} />
              </Button>
              <span className="text-[13px] text-ink-3">Sends the {brandName} rep the list and parks this watch in Waiting for parts.</span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3.5">
            <Button variant={missing.length ? "secondary" : "primary"} disabled={pending || missing.length > 0} onClick={toFix}>
              {requested ? "All arrived" : "All in hand"} <ArrowRight size={14} /> Fix
            </Button>
            {missing.length ? (
              <span className="text-[13px] text-ink-3">
                <span className="text-amber">{missing.length} left:</span> {missing.map(display).join(", ")}{parked ? " to arrive" : ""}
              </span>
            ) : null}
            {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
            <span className="ml-auto flex items-center gap-4">
              {parked && missing.length ? (
                <button type="button" onClick={message} disabled={pending} className="text-[13px] text-ink-2 hover:text-ink">Send another message</button>
              ) : null}
              <button type="button" onClick={back} disabled={pending} className="flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
                <ArrowUUpLeft size={13} /> Back to Inspect
              </button>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">{parked ? `Waiting on ${missing.map(display).join(", ")}.` : "The watchmaker sorts the parts."}</p>
      )}
    </>
  );
}
