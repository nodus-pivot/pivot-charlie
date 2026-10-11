"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Check, Watch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field, Input } from "@/components/ui/field";
import { CountrySelect } from "@/components/ui/country-select";
import { cn } from "@/lib/utils";
import { lookupRepair, requestAddressChange, type AddressRequestState, type LookupState } from "../actions";
import { maskedAddress, publicLabel, publicSteps, rightNowNote } from "../public";

const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

/** P2: ticket number + email on the left; the result fills the right. Nothing in the URL. */
export function StatusLookup() {
  const [state, action, pending] = useActionState<LookupState, FormData>(lookupRepair, {});
  const s = state.status;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="flex flex-col gap-7 px-4 py-12 sm:px-8 lg:w-1/2 lg:px-16 lg:py-16">
        <Eyebrow>Check a repair</Eyebrow>
        <h1 className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[56px]">Where is my watch?</h1>
        <p className="max-w-[400px] text-[15px] leading-[1.55] text-ink-2">Enter the ticket number from your confirmation email and the email you used.</p>
        <form action={action} className="flex max-w-[380px] flex-col gap-6" noValidate>
          <Field label="Ticket number" htmlFor="number">
            <Input id="number" name="number" defaultValue={state.number ?? ""} placeholder="NW260005" autoComplete="off" className="font-mono uppercase" invalid={!!state.error} required />
          </Field>
          <Field label="Email" htmlFor="email" error={state.error}>
            <Input id="email" name="email" type="email" defaultValue={state.email ?? ""} placeholder="you@example.com" autoComplete="email" invalid={!!state.error} required />
          </Field>
          <div>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Looking…" : "Find my repair"} <ArrowRight size={14} />
            </Button>
          </div>
        </form>
      </section>

      <section className="flex flex-1 flex-col border-t border-rule bg-panel px-4 py-12 sm:px-8 lg:border-l lg:border-t-0 lg:px-16 lg:py-16">
        {s ? <Result s={s} email={state.email ?? ""} /> : (
          <div className="my-auto max-w-[380px] text-sm text-ink-3">
            <p>Your repair&rsquo;s progress appears here: when we received the watch, what&rsquo;s happening now, and when it ships back.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Result({ s, email }: { s: NonNullable<LookupState["status"]>; email: string }) {
  const steps = publicSteps(s);
  const [changing, setChanging] = useState(false);
  const [country, setCountry] = useState("US");
  const [addr, addrAction, addrPending] = useActionState<AddressRequestState, FormData>(requestAddressChange, {});
  const pendingChange = s.address_change_pending || addr.ok;

  return (
    <div className="flex max-w-[560px] flex-col gap-7">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[13px] text-ink-3">{s.number}{s.watch ? ` · Nodus ${s.watch}` : ""}</span>
          <h2 className="font-display text-[40px] leading-none font-semibold tracking-[-0.02em] text-ink">{s.first_name}&rsquo;s repair</h2>
          <span className="text-sm text-ink-2">Submitted {longDate.format(new Date(s.submitted_at))}</span>
        </div>
        <span className="grid size-24 shrink-0 place-items-center rounded-xs border border-dashed border-border-strong text-border-strong"><Watch size={28} /></span>
      </div>

      <div className="flex flex-col gap-1.5 border border-gold bg-gold/5 p-4">
        <span className="text-[11px] uppercase tracking-label text-ink-3">Right now</span>
        <span className="font-display text-[26px] leading-tight font-semibold text-ink">{publicLabel(s.stage)}</span>
        <span className="text-[13px] text-ink-2">{rightNowNote(s)}</span>
      </div>

      <ol className="flex flex-col gap-4">
        {steps.map((st) => (
          <li key={st.key} className="flex items-start gap-3.5">
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                st.state === "done" ? "border-gold/60 bg-panel text-gold" : st.state === "current" ? "border-gold bg-gold text-ground" : "border-border-strong text-transparent",
              )}
              aria-hidden
            >
              {st.state === "done" ? <Check size={12} /> : null}
            </span>
            <span className="flex flex-col">
              <span className={cn("text-[15px]", st.state === "future" ? "text-ink-3" : "text-ink")}>{st.label}</span>
              {st.date ? <span className="text-[13px] text-ink-3">{st.date}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {s.stage !== "closed" && !s.return_to_everett ? (
        <div className="flex flex-col gap-2 border-t border-rule pt-5">
          <span className="text-[11px] uppercase tracking-label text-ink-3">Return address</span>
          <span className="text-sm text-ink-2">
            {maskedAddress(s.ship_to) || "We don\u2019t have one yet"}
            {!pendingChange && !changing ? (
              <>
                {" · "}
                <button type="button" onClick={() => setChanging(true)} className="text-gold-light hover:text-gold">Need to change this?</button>
              </>
            ) : null}
          </span>
          {pendingChange ? (
            <span className="text-[13px] text-green">We have your new address. We&rsquo;ll confirm it with you by email before anything ships.</span>
          ) : changing ? (
            <form action={addrAction} className="mt-2 grid gap-3">
              <input type="hidden" name="number" value={s.number} />
              <input type="hidden" name="email" value={email} />
              <Input name="line1" placeholder="Street" required />
              <Input name="line2" placeholder="Apt, suite (optional)" />
              <div className="grid grid-cols-[1fr_72px_96px] gap-3">
                <Input name="city" placeholder="City" required />
                <Input name="state" placeholder="State" />
                <Input name="postal_code" placeholder="ZIP" />
              </div>
              <CountrySelect name="country" value={country} onChange={setCountry} className="h-11 border-b border-border-strong text-[15px] text-ink focus:border-gold" />
              {addr.error ? <p role="alert" className="text-[13px] text-coral">{addr.error}</p> : null}
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" type="button" onClick={() => setChanging(false)}>Cancel</Button>
                <Button size="sm" variant="primary" type="submit" disabled={addrPending}>{addrPending ? "Sending…" : "Send new address"}</Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
