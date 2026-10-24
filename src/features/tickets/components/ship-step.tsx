"use client";

import { useState } from "react";
import { CheckCircle, EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/ui/country-select";
import { Soon } from "@/components/ui/soon";
import { addressInline, type Address } from "@/lib/address";
import { cn } from "@/lib/utils";

/**
 * D7: the Ship-to card (with Edit), the Label card (generated label or
 * carrier + tracking typed by hand) and the customer email line.
 */
export type ShipFields = { carrier: string; tracking: string; labelUrl: string };

export function ShipStep({
  name,
  shipTo,
  everett,
  onSaveAddress,
  fields,
  onFields,
  onFieldsBlur,
  labelGeneratedAt,
  email,
  shippedEmail,
  disabled,
}: {
  name: string;
  shipTo: Address | null;
  /** Return-to-Everett tickets ship to fulfillment: the card is read-only. */
  everett: boolean;
  onSaveAddress: (a: Required<Omit<Address, "name">>) => Promise<boolean>;
  fields: ShipFields;
  onFields: (f: ShipFields) => void;
  onFieldsBlur: () => void;
  labelGeneratedAt: string | null;
  email: string | null;
  /** The logged "on its way" email, once Shipped was ticked. */
  shippedEmail: { at: string } | null;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ line1: shipTo?.line1 ?? "", line2: shipTo?.line2 ?? "", city: shipTo?.city ?? "", state: shipTo?.state ?? "", postal_code: shipTo?.postal_code ?? "", country: shipTo?.country ?? "US" });
  const [saving, setSaving] = useState(false);
  const hasLabel = !!fields.labelUrl.trim();
  const field = "h-9 w-full border-b border-border-strong bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-xs border border-rule px-[18px] py-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-label text-ink-3">Ship to</span>
            {!everett && !disabled ? (
              <button type="button" onClick={() => setEditing((v) => !v)} className="text-[12px] text-gold transition-colors hover:text-gold-light">{editing ? "Cancel" : "Edit"}</button>
            ) : null}
          </div>
          {editing ? (
            <form
              className="mt-1 grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                const ok = await onSaveAddress(draft);
                setSaving(false);
                if (ok) setEditing(false);
              }}
            >
              <input value={draft.line1} onChange={(e) => setDraft({ ...draft, line1: e.target.value })} placeholder="Street" className={field} />
              <input value={draft.line2} onChange={(e) => setDraft({ ...draft, line2: e.target.value })} placeholder="Apt, suite" className={field} />
              <div className="grid grid-cols-[1fr_56px_80px] gap-2">
                <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="City" className={field} />
                <input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="ST" className={field} />
                <input value={draft.postal_code} onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })} placeholder="ZIP" className={field} />
              </div>
              <CountrySelect value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} className={field} />
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save address"}</Button>
              </div>
            </form>
          ) : (
            <>
              <span className="text-[16px] font-medium text-ink">{everett ? (shipTo?.name ?? "Nodus Fulfillment") : name}</span>
              <span className="text-[14px] text-ink-2">{shipTo ? addressInline(shipTo) : <span className="text-amber">No address on the ticket</span>}</span>
              {everett ? <span className="text-[12px] text-ink-3">Return to Everett · not to the customer</span> : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xs border border-rule px-[18px] py-4">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Label</span>
          {hasLabel ? (
            <>
              <span className="flex items-center gap-2 text-[15px] text-ink">
                <CheckCircle size={16} className="shrink-0 text-green" aria-hidden /> Generated{labelGeneratedAt ? ` ${labelGeneratedAt}` : ""}{fields.carrier ? ` · ${fields.carrier}` : ""}
              </span>
              {fields.tracking ? <span className="font-mono text-[13px] text-ink-2">{fields.tracking}</span> : null}
              <a href={fields.labelUrl} target="_blank" rel="noreferrer" className="text-[12px] text-gold hover:text-gold-light">Print label</a>
            </>
          ) : (
            <>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <input value={fields.carrier} onChange={(e) => onFields({ ...fields, carrier: e.target.value })} onBlur={onFieldsBlur} disabled={disabled} placeholder="Carrier" aria-label="Carrier" className={field} />
                <input value={fields.tracking} onChange={(e) => onFields({ ...fields, tracking: e.target.value })} onBlur={onFieldsBlur} disabled={disabled} placeholder="Tracking number" aria-label="Tracking number" className={cn(field, "font-mono")} />
              </div>
              <span className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                <Soon size="sm" hint="ShipStation">Generate label</Soon> or enter tracking by hand
              </span>
            </>
          )}
        </div>
      </div>

      {email ? (
        <p className={cn("flex items-center gap-2.5 text-[14px]", shippedEmail ? "text-green" : "text-ink-3")}>
          <EnvelopeSimple size={16} className="shrink-0" aria-hidden />
          {shippedEmail
            ? <>Email logged for {email} · “Your watch is on its way” with tracking · {shippedEmail.at}</>
            : <>Shipped logs “Your watch is on its way” to {email} with the tracking number. Nothing is emailed yet.</>}
        </p>
      ) : (
        <p className="text-[14px] text-amber">No customer email on the ticket, so nothing can be sent.</p>
      )}
    </>
  );
}
