"use client";

import { useState } from "react";
import { ArrowSquareOut, CheckCircle, Clock, Copy, CurrencyDollar, Receipt, WarningCircle } from "@phosphor-icons/react";
import { BigTick } from "@/components/ui/big-tick";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type InvoiceView = {
  status: "open" | "paid" | "void" | "expired";
  url: string;
  sentAt: string;
  dueAt: string;
  paidAt: string | null;
  /** "due in 6 days" · "due today" · "2 days overdue", worked out when the page rendered. */
  dueText: string;
};

/**
 * D6: three cards (cost · invoice · status) and the Payment received tick.
 * The cost is typed in place; the invoice card sends a Stripe invoice and
 * then shows when it went out, when it is due and the pay link to copy.
 */
export function PaymentStep({
  amount,
  onAmount,
  onAmountBlur,
  invoice,
  onSendInvoice,
  paid,
  onPaidToggle,
  disabled,
}: {
  amount: string;
  onAmount: (v: string) => void;
  onAmountBlur: () => void;
  /** The open invoice, else the newest one; null before the first is sent. */
  invoice: InvoiceView | null;
  onSendInvoice: () => void;
  paid: boolean;
  onPaidToggle: () => void;
  disabled: boolean;
}) {
  const active = invoice && (invoice.status === "open" || invoice.status === "paid") ? invoice : null;
  const canSend = !active && !disabled && Number(amount) > 0;
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
              disabled={disabled || !!active}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Repair cost"
              className="w-24 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
            />
          </span>
        </Card>
        <Card label="Invoice">
          {active ? (
            <InvoiceLine invoice={active} />
          ) : (
            <button type="button" disabled={!canSend} onClick={onSendInvoice} className="flex items-center gap-2 text-left text-[16px] text-ink transition-colors hover:text-gold-light disabled:cursor-default disabled:text-ink-3 disabled:hover:text-ink-3">
              <Receipt size={16} className="shrink-0" aria-hidden />
              {invoice ? "Send a new invoice" : "Send invoice"}
            </button>
          )}
        </Card>
        <Card label="Status">
          <StatusLine paid={paid} invoice={invoice} />
        </Card>
      </div>
      <BigTick on={paid} onToggle={onPaidToggle} label="Payment received" hint={active?.status === "open" ? "Ticks itself when Stripe says the invoice is paid. Tick it yourself for cash or a check." : "Tick when the customer has paid. Warranty repairs skip this step."} disabled={disabled} />
    </>
  );
}

function InvoiceLine({ invoice }: { invoice: InvoiceView }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(invoice.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy the pay link", invoice.url);
    }
  }
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2 text-[16px] text-ink">
        <Receipt size={16} className="shrink-0 text-gold" aria-hidden />
        <span className="truncate">Sent {formatDate(invoice.sentAt)} · {invoice.status === "paid" ? `paid ${formatDate(invoice.paidAt ?? invoice.sentAt)}` : `due ${formatDate(invoice.dueAt)}`}</span>
      </span>
      <span className="flex items-center gap-3 text-[12px] text-ink-3">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 transition-colors hover:text-ink">
          <Copy size={12} aria-hidden /> {copied ? "Copied" : "Copy pay link"}
        </button>
        <a href={invoice.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-ink">
          <ArrowSquareOut size={12} aria-hidden /> Open
        </a>
      </span>
    </span>
  );
}

function StatusLine({ paid, invoice }: { paid: boolean; invoice: InvoiceView | null }) {
  if (paid) {
    return (
      <>
        <CheckCircle size={16} className="shrink-0 text-green" aria-hidden />
        <span className="text-green">Paid{invoice?.status === "paid" && invoice.paidAt ? ` ${formatDate(invoice.paidAt)}` : ""}</span>
      </>
    );
  }
  if (invoice?.status === "open") {
    return (
      <>
        <Clock size={16} className="shrink-0 text-gold" aria-hidden />
        <span className="text-ink">Awaiting payment · {invoice.dueText}</span>
      </>
    );
  }
  if (invoice?.status === "expired" || invoice?.status === "void") {
    return (
      <>
        <WarningCircle size={16} className="shrink-0 text-coral" aria-hidden />
        <span className="text-coral">{invoice.status === "expired" ? `Expired ${formatDate(invoice.dueAt)} · send a new one` : "Voided in Stripe"}</span>
      </>
    );
  }
  return (
    <>
      <Clock size={16} className={cn("shrink-0", "text-gold")} aria-hidden />
      <span className="text-ink">Not paid yet</span>
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
