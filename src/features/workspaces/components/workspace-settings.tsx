"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CountrySelect } from "@/components/ui/country-select";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { Address } from "@/lib/address";
import { cn } from "@/lib/utils";
import { createBrand, renameBrand, sendMailTest, sendSlackTest, setBrandActive, updateWorkspace, type AddressFields } from "../actions";
import type { BrandSummary, Workspace } from "../queries";

const field = "h-10 w-full border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none";
const label = "flex flex-col gap-1.5 text-[11px] uppercase tracking-label text-ink-3";

function fields(a: Address | null | undefined): AddressFields {
  return { name: a?.name ?? "", line1: a?.line1 ?? "", line2: a?.line2 ?? "", city: a?.city ?? "", state: a?.state ?? "", postal_code: a?.postal_code ?? "", country: a?.country ?? "US" };
}

/** Ops › Workspace: operating details, the two addresses that tickets use, and the brands. */
export function WorkspaceSettings({ workspace, brands, isOwner, slack, mail, myEmail }: { workspace: Workspace; brands: BrandSummary[]; isOwner: boolean; slack: { configured: boolean; channel: string | null }; mail: { configured: boolean; from: string | null }; myEmail: string }) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [prefix, setPrefix] = useState(workspace.ticket_prefix);
  const [bench, setBench] = useState<AddressFields>(fields(workspace.bench_address as Address | null));
  const [fulfillment, setFulfillment] = useState<AddressFields>(fields(workspace.fulfillment_address as Address | null));
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    setSaved("saving");
    start(async () => {
      const r = await updateWorkspace({ workspaceId: workspace.id, name, ticketPrefix: prefix, bench, fulfillment });
      if (!r.ok) {
        setSaved("idle");
        setError(r.error);
        return;
      }
      setSaved("saved");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-10 px-4 pb-10 pt-7 sm:px-8 lg:px-12">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex max-w-[980px] flex-col gap-8">
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-[1fr_160px]">
          <label className={label}>Workspace<input value={name} onChange={(e) => setName(e.target.value)} className={field} required /></label>
          <label className={label}>
            Ticket prefix
            <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} className={`${field} font-mono`} maxLength={6} required />
            <span className="text-[11px] normal-case tracking-normal text-ink-3">New tickets only: {prefix || "NW"}26{"0001"}</span>
          </label>
        </div>

        <div className="grid gap-x-14 gap-y-8 lg:grid-cols-2">
          <AddressBlock title="Bench address" hint="Where customers and the brand send watches and parts." value={bench} onChange={setBench} />
          <AddressBlock title="Fulfillment address · Everett" hint="Where a Return to Everett ticket ships after the repair, instead of to the customer." value={fulfillment} onChange={setFulfillment} tone="amber" />
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save workspace"}</Button>
          {saved === "saved" ? <span className="text-[13px] text-green">Saved</span> : null}
          {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
        </div>
      </form>

      <Brands workspaceId={workspace.id} brands={brands} isOwner={isOwner} />
      <Integrations workspaceId={workspace.id} slack={slack} mail={mail} myEmail={myEmail} />
    </section>
  );
}

function AddressBlock({ title, hint, value, onChange, tone }: { title: string; hint: string; value: AddressFields; onChange: (a: AddressFields) => void; tone?: "amber" }) {
  const set = (k: keyof AddressFields) => (v: string) => onChange({ ...value, [k]: v });
  const empty = !value.line1 && !value.city;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {empty ? <Chip tone={tone ?? "neutral"}>not set</Chip> : null}
      </div>
      <p className="-mt-2 text-[13px] text-ink-3">{hint}</p>
      <label className={label}>Name on the label<input value={value.name} onChange={(e) => set("name")(e.target.value)} placeholder="Nodus Service Center" className={field} /></label>
      <label className={label}>Street<input value={value.line1} onChange={(e) => set("line1")(e.target.value)} placeholder="Street" className={field} /></label>
      <label className={label}>Line 2<input value={value.line2} onChange={(e) => set("line2")(e.target.value)} placeholder="Suite, unit (optional)" className={field} /></label>
      <div className="grid grid-cols-[1fr_72px_110px] gap-3">
        <label className={label}>City<input value={value.city} onChange={(e) => set("city")(e.target.value)} className={field} /></label>
        <label className={label}>State<input value={value.state} onChange={(e) => set("state")(e.target.value)} className={field} /></label>
        <label className={label}>ZIP<input value={value.postal_code} onChange={(e) => set("postal_code")(e.target.value)} className={`${field} font-mono`} /></label>
      </div>
      <label className={label}>Country<CountrySelect value={value.country} onChange={set("country")} className={field} /></label>
    </div>
  );
}

function Brands({ workspaceId, brands, isOwner }: { workspaceId: string; brands: BrandSummary[]; isOwner: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        setAdding(false);
        setNewName("");
        setRenaming(null);
        router.refresh();
      }
    });

  return (
    <div className="flex max-w-[980px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Brands</Eyebrow>
          <p className="text-[13px] text-ink-3">Each brand has its own reps and watchmakers. Retiring a brand hides it from pickers; its tickets keep working.</p>
        </div>
        {isOwner && !adding ? <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus size={12} /> New brand</Button> : null}
      </div>
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); run(() => createBrand(workspaceId, newName)); }} className="flex items-end gap-3 border border-rule bg-panel p-4">
          <label className={`${label} flex-1`}>Brand name<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Connexus" className={field} autoFocus required /></label>
          <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button>
          <Button size="sm" variant="primary" type="submit" disabled={pending || !newName.trim()}>Add brand</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-[13px] text-coral">{error}</p> : null}
      <div className="flex flex-col">
        {brands.map((b) => (
          <div key={b.id} className={cn("flex flex-wrap items-center gap-4 border-t border-rule py-3.5 last:border-b", !b.is_active && "opacity-60")}>
            {renaming === b.id ? (
              <form onSubmit={(e) => { e.preventDefault(); run(() => renameBrand(b.id, draft)); }} className="flex flex-1 items-center gap-2">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 border-b border-border-strong bg-transparent font-display text-[22px] font-semibold text-ink outline-none focus:border-gold" autoFocus aria-label="Brand name" />
                <Button size="sm" variant="primary" type="submit" disabled={pending}>Save</Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}><X size={12} /></Button>
              </form>
            ) : (
              <span className="flex flex-1 items-baseline gap-3">
                <span className="font-display text-[22px] font-semibold text-ink">{b.name}</span>
                <span className="font-mono text-xs text-ink-3">{b.tickets} open ticket{b.tickets === 1 ? "" : "s"}</span>
                {!b.is_active ? <Chip tone="neutral">retired</Chip> : null}
              </span>
            )}
            {renaming !== b.id ? (
              <span className="flex gap-2">
                <Button size="sm" onClick={() => { setRenaming(b.id); setDraft(b.name); }}>Rename</Button>
                {b.is_active ? <Button size="sm" disabled={pending} onClick={() => run(() => setBrandActive(b.id, false))}>Retire</Button> : <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => setBrandActive(b.id, true))}>Bring back</Button>}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Integrations({ workspaceId, slack, mail, myEmail }: { workspaceId: string; slack: { configured: boolean; channel: string | null }; mail: { configured: boolean; from: string | null }; myEmail: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [mailResult, setMailResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState(myEmail);
  const [pending, start] = useTransition();
  const [mailPending, startMail] = useTransition();
  function test() {
    setResult(null);
    start(async () => {
      const r = await sendSlackTest(workspaceId);
      setResult(r.ok ? { ok: true, text: "Posted. Check the channel." } : { ok: false, text: r.error });
    });
  }
  function testMail() {
    setMailResult(null);
    startMail(async () => {
      const r = await sendMailTest(workspaceId, to);
      setMailResult(r.ok ? { ok: true, text: `Sent to ${to.trim()}. Check the inbox.` } : { ok: false, text: r.error });
    });
  }
  return (
    <div className="flex max-w-[980px] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Eyebrow>Integrations</Eyebrow>
        <p className="text-[13px] text-ink-3">Parts requests and customer address changes post to one Slack channel; customer emails go out from one mailbox. Tokens and passwords live in the hosting settings, not here.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-rule py-3.5">
        <span className="flex flex-1 items-baseline gap-3">
          <span className="font-display text-[22px] font-semibold text-ink">Slack</span>
          {slack.configured ? <Chip tone="green">configured</Chip> : <Chip tone="amber">not configured</Chip>}
          {slack.channel ? <span className="font-mono text-xs text-ink-3">{slack.channel}</span> : null}
        </span>
        <Button size="sm" disabled={!slack.configured || pending} onClick={test}>{pending ? "Sending…" : "Send a test message"}</Button>
      </div>
      {result ? <p role={result.ok ? "status" : "alert"} className={cn("text-[13px]", result.ok ? "text-green" : "text-coral")}>{result.text}</p> : null}
      <div className="flex flex-wrap items-center gap-4 border-t border-b border-rule py-3.5">
        <span className="flex flex-1 items-baseline gap-3">
          <span className="font-display text-[22px] font-semibold text-ink">Email</span>
          {mail.configured ? <Chip tone="green">configured</Chip> : <Chip tone="amber">not configured</Chip>}
          {mail.from ? <span className="font-mono text-xs text-ink-3">{mail.from}</span> : null}
        </span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          type="email"
          placeholder="Send a test to…"
          aria-label="Test email address"
          className="h-9 w-64 border-b border-border-strong bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none"
        />
        <Button size="sm" disabled={!mail.configured || mailPending || !to.trim()} onClick={testMail}>{mailPending ? "Sending…" : "Send a test email"}</Button>
      </div>
      {mailResult ? <p role={mailResult.ok ? "status" : "alert"} className={cn("text-[13px]", mailResult.ok ? "text-green" : "text-coral")}>{mailResult.text}</p> : null}
    </div>
  );
}
