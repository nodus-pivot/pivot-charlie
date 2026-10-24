"use client";

import { CheckCircle, Clock, CurrencyDollar, Receipt } from "@phosphor-icons/react";
import { BigTick } from "@/components/ui/big-tick";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * D6: three cards (cost · invoice · status) and the Payment received tick.
 * The cost is typed in place; the invoice card toggles sent / not sent.
 */
export function PaymentStep({
  amount,
  onAmount,
  onAmountBlur,
  invoiceSent,
  invoiceSentAt,
  onInvoiceToggle,
  paid,
  onPaidToggle,
  disabled,
}: {
  amount: string;
  onAmount: (v: string) => void;
  onAmountBlur: () => void;
  invoiceSent: boolean;
  invoiceSentAt: string | null;
  onInvoiceToggle: () => void;
  paid: boolean;
  onPaidToggle: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Card label="Repair cost">
          <CurrencyDollar size={16} className="shrink-0 text-gold" aria-hidden />
          <span className="flex items-baseline">
            $
            <input
              value={amount}
              onChange={(e) => onAmount(e.target.value.replace(/[^\d.]/g, ""))}
              onBlur={onAmountBlur}
              disabled={disabled}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Repair cost"
              className="w-24 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
            />
          </span>
        </Card>
        <Card label="Invoice">
          <button type="button" disabled={disabled} onClick={onInvoiceToggle} className="flex items-center gap-2 text-left text-[16px] text-ink transition-colors hover:text-gold-light disabled:cursor-default disabled:hover:text-ink">
            <Receipt size={16} className={cn("shrink-0", invoiceSent ? "text-gold" : "text-ink-3")} aria-hidden />
            {invoiceSent ? `Sent ${invoiceSentAt ? formatDate(invoiceSentAt) : "today"} · by Nodus` : "Not sent yet"}
          </button>
        </Card>
        <Card label="Status">
          {paid ? <CheckCircle size={16} className="shrink-0 text-green" aria-hidden /> : <Clock size={16} className="shrink-0 text-gold" aria-hidden />}
          <span className={paid ? "text-green" : "text-ink"}>{paid ? "Paid" : "Not paid yet"}</span>
        </Card>
      </div>
      <BigTick on={paid} onToggle={onPaidToggle} label="Payment received" hint="Tick when the customer has paid. Warranty repairs skip this step." disabled={disabled} />
    </>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xs border border-rule px-4 py-3.5">
      <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
      <span className="flex items-center gap-2 text-[16px] text-ink">{children}</span>
    </div>
  );
}
