"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, ArrowUUpLeft, CheckCircle, CheckSquare, HandArrowUp, Square } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { addressLines, isInternational, type Address } from "@/lib/address";
import { CountrySelect } from "@/components/ui/country-select";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { saveShipment, sendBack, setPaymentReceived, shipTicket, updateShipTo } from "../actions";

type Carrier = "usps" | "ups" | "fedex";

type Props = {
  number: string;
  customerName: string;
  shipTo: Address | null;
  returnToEverett: boolean;
  fulfillment: Address | null;
  initial: { carrier: Carrier | null; tracking: string; handedOver: boolean; signatureRequired: boolean; emailCustomer: boolean };
  payment: { needed: boolean; amount: number | null; received: boolean };
  isAdmin: boolean;
  canAct: boolean;
};

/** S9: address card, in-person handoff, label (greyed until ShipStation), carrier + tracking, email, then Shipped → Close. */
export function ShipStep({ number, customerName, shipTo, returnToEverett, fulfillment, initial, payment, isAdmin, canAct }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [addr, setAddr] = useState<Record<"line1" | "line2" | "city" | "state" | "postal_code" | "country", string>>({
    line1: shipTo?.line1 ?? "",
    line2: shipTo?.line2 ?? "",
    city: shipTo?.city ?? "",
    state: shipTo?.state ?? "",
    postal_code: shipTo?.postal_code ?? "",
    country: shipTo?.country ?? "US",
  });
  const [paid, setPaid] = useState(payment.received);
  const [error, setError] = useState<string | null>(null);
  const [, save] = useTransition();
  const [pending, start] = useTransition();

  const destination = returnToEverett ? fulfillment : shipTo;
  const destinationName = returnToEverett ? (fulfillment?.name ?? "Nodus fulfillment") : customerName;
  const ready = form.handedOver || form.tracking.trim().length > 0;
  const paymentBlocks = payment.needed && !paid;

  function patch(p: Partial<typeof form>) {
    const next = { ...form, ...p };
    setForm(next);
    setError(null);
    save(async () => {
      const r = await saveShipment(number, next);
      if (!r.ok) setError(r.error);
    });
  }

  function saveAddress() {
    setError(null);
    start(async () => {
      const r = await updateShipTo(number, addr);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      await saveShipment(number, form); // refresh the snapshot
      router.refresh();
    });
  }

  function togglePaid() {
    const next = !paid;
    setPaid(next);
    save(async () => {
      const r = await setPaymentReceived(number, next);
      if (!r.ok) {
        setPaid(!next);
        setError(r.error);
      }
    });
  }

  function ship(override = false) {
    setError(null);
    start(async () => {
      const r = await shipTicket(number, { override });
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
      const r = await sendBack(number, "test");
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* ------------------------------------------------ ship to */}
        <div className="flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Ship to</span>
          {editing ? (
            <div className="flex flex-col gap-2 border border-rule bg-panel p-3">
              {(["line1", "line2", "city", "state", "postal_code"] as const).map((k) => (
                <input
                  key={k}
                  value={addr[k]}
                  onChange={(e) => setAddr((a) => ({ ...a, [k]: e.target.value }))}
                  placeholder={{ line1: "Street", line2: "Apt, suite (optional)", city: "City", state: "State", postal_code: "ZIP" }[k]}
                  className="h-9 border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
                />
              ))}
              <CountrySelect value={addr.country} onChange={(v) => setAddr((a) => ({ ...a, country: v }))} className="h-9 border-b border-border-strong text-[15px] text-ink focus:border-gold" />
              <div className="mt-1 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={pending} onClick={saveAddress}>Save address</Button>
              </div>
            </div>
          ) : (
            <div className={cn("flex items-start gap-3 border p-3.5", form.handedOver ? "border-rule opacity-60" : "border-gold bg-gold/5")}>
              <CheckCircle size={18} className={cn("mt-0.5 shrink-0", form.handedOver ? "text-ink-3" : "text-gold-light")} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[15px] text-ink">
                  {destinationName}
                  {isInternational(destination) ? <Chip tone="amber">International · customs form</Chip> : null}
                </span>
                {destination && addressLines(destination).length ? (
                  <span className="text-sm text-ink-2">{addressLines(destination).join(" · ")}</span>
                ) : (
                  <span className="text-sm text-amber">No address on file</span>
                )}
                {returnToEverett ? <span className="text-xs text-amber">Return to Everett: goes to fulfillment, not the customer.</span> : null}
              </div>
              {canAct && !returnToEverett ? (
                <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-gold-light hover:text-gold">Edit</button>
              ) : null}
            </div>
          )}
          <button
            type="button"
            onClick={() => canAct && patch({ handedOver: !form.handedOver })}
            disabled={!canAct}
            aria-pressed={form.handedOver}
            className={cn("flex items-center gap-3 border border-dashed p-3.5 text-left text-sm transition-colors", form.handedOver ? "border-gold bg-gold/5 text-ink" : "border-border-strong text-ink-2 hover:border-gold")}
          >
            <HandArrowUp size={18} className={form.handedOver ? "text-gold-light" : "text-ink-3"} />
            Handed over in person — no shipping
          </button>
        </div>

        {/* ------------------------------------------------ label + tracking */}
        <div className={cn("flex flex-col gap-4", form.handedOver && "opacity-50")}>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-label text-ink-3">Label</span>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled title="ShipStation arrives later">Print USPS label</Button>
              <span className="text-[13px] text-ink-3">ShipStation · coming soon</span>
            </div>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-label text-ink-3">Carrier</span>
              <select
                value={form.carrier ?? ""}
                onChange={(e) => patch({ carrier: (e.target.value || null) as Carrier | null })}
                disabled={!canAct || form.handedOver}
                className="h-9 border-b border-border-strong bg-transparent text-[15px] text-ink outline-none focus:border-gold [&>option]:bg-panel"
              >
                <option value="">Pick ▾</option>
                <option value="usps">USPS</option>
                <option value="ups">UPS</option>
                <option value="fedex">FedEx</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] uppercase tracking-label text-ink-3">Tracking</span>
              <input
                value={form.tracking}
                onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))}
                onBlur={() => form.tracking !== initial.tracking && patch({ tracking: form.tracking })}
                disabled={!canAct || form.handedOver}
                placeholder="9400 1108 …"
                className="h-9 border-b border-border-strong bg-transparent font-mono text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
                aria-label="Tracking number"
              />
            </label>
          </div>
          <Box on={form.signatureRequired} disabled={!canAct} onClick={() => patch({ signatureRequired: !form.signatureRequired })}>Signature on delivery</Box>
        </div>
      </div>

      <Box on={form.emailCustomer} disabled={!canAct} onClick={() => patch({ emailCustomer: !form.emailCustomer })}>
        Email &ldquo;On its way&rdquo; when I click Ship
      </Box>

      {payment.needed ? (
        <div className={cn("flex flex-wrap items-center gap-4 border p-3.5", paid ? "border-green/50 bg-green/5" : "border-amber/60 bg-amber/10")}>
          <span className="text-[11px] uppercase tracking-label text-ink-3">Payment</span>
          <span className={cn("text-sm", paid ? "text-green" : "text-amber")}>
            {payment.amount !== null ? `$${payment.amount}` : "Paid repair"} · {paid ? "received" : "outstanding"}
          </span>
          <button type="button" onClick={togglePaid} disabled={!canAct} aria-pressed={paid} className="ml-auto flex items-center gap-2 text-sm text-ink-2 hover:text-ink">
            {paid ? <CheckSquare size={18} className="text-green" /> : <Square size={18} className="text-ink-3" />}
            Payment received
          </button>
        </div>
      ) : null}

      {canAct ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <Button variant="primary" disabled={pending || !ready || paymentBlocks} onClick={() => ship(false)}>
            Shipped <ArrowRight size={14} /> Close ticket
          </Button>
          {!ready ? (
            <span className="text-[13px] text-ink-3"><span className="text-amber">1 left:</span> tracking number or handed over</span>
          ) : paymentBlocks ? (
            <span className="text-[13px] text-ink-3">
              <span className="text-amber">1 left:</span> payment received
              {isAdmin ? (
                <>
                  {" · "}
                  <button type="button" onClick={() => ship(true)} disabled={pending} className="text-gold-light underline-offset-2 hover:underline">close anyway</button>
                </>
              ) : null}
            </span>
          ) : null}
          {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
          <button type="button" onClick={back} disabled={pending} className="ml-auto flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowUUpLeft size={13} /> Back to Test
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">Waiting for the bench to ship it.</p>
      )}
    </>
  );
}

function Box({ on, disabled, onClick, children }: { on: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} className="flex items-center gap-2 self-start text-sm text-ink-2 hover:text-ink disabled:opacity-100">
      {on ? <CheckSquare size={18} className="text-gold-light" /> : <Square size={18} className="text-ink-3" />}
      {children}
    </button>
  );
}
