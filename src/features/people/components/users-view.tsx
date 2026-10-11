"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CaretUpDown, Check, Copy, Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { canManageGrant, canManagePerson } from "@/features/auth/permissions";
import { ROLE_LABELS, isOwner, type Grant, type MemberRole } from "@/features/pipeline";
import { cn } from "@/lib/utils";
import { addGrant, createPerson, removeGrant, renamePerson, resetPassword, setPersonActive, type GrantInput } from "../actions";
import type { Person } from "../queries";

type Named = { id: string; name: string };
type Props = { people: Person[]; selfId: string; realGrants: Grant[]; workspaces: Named[]; brands: (Named & { workspace_id: string })[] };

const ROLES: MemberRole[] = ["owner", "admin", "brand_rep", "watchmaker"];

function grantLabel(g: Grant, workspaces: Named[], brands: Named[]): string {
  const scope = g.role === "admin" ? workspaces.find((w) => w.id === g.workspace_id)?.name : g.brand_id ? brands.find((b) => b.id === g.brand_id)?.name : null;
  return scope ? `${ROLE_LABELS[g.role]} · ${scope}` : ROLE_LABELS[g.role];
}

/** Ops › Users: the people in your workspaces, their roles, and the account controls owners and admins have. */
export function UsersView({ people, selfId, realGrants, workspaces, brands }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const brandWorkspace = (id: string) => brands.find((b) => b.id === id)?.workspace_id;
  const owner = isOwner(realGrants);

  const active = people.filter((p) => p.is_active);
  const inactive = people.filter((p) => !p.is_active);

  return (
    <section className="flex flex-col gap-6 px-4 pb-10 pt-7 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[620px] text-[15px] text-ink-2">
          Accounts are created here and handed a temporary password. {owner ? "Owners grant any role." : "Admins grant brand rep and watchmaker roles inside their workspaces."}
        </p>
        {!adding ? <Button variant="primary" onClick={() => { setAdding(true); setReveal(null); }}>New person</Button> : null}
      </div>

      {reveal ? <PasswordReveal email={reveal.email} password={reveal.password} onDone={() => setReveal(null)} /> : null}
      {adding ? (
        <NewPerson
          workspaces={workspaces}
          brands={brands}
          realGrants={realGrants}
          onClose={() => setAdding(false)}
          onCreated={(email, password) => { setAdding(false); setReveal({ email, password }); router.refresh(); }}
        />
      ) : null}
      {error ? <p role="alert" className="text-[13px] text-coral">{error}</p> : null}

      <div className="flex flex-col">
        {active.map((p) => (
          <PersonRow key={p.id} p={p} selfId={selfId} realGrants={realGrants} workspaces={workspaces} brands={brands} brandWorkspace={brandWorkspace} onPassword={(pw) => setReveal({ email: p.email, password: pw })} onError={setError} />
        ))}
        {inactive.length ? (
          <>
            <div className="pb-2 pt-7 text-[11px] uppercase tracking-label text-ink-3">Deactivated <span className="font-mono normal-case">{inactive.length}</span></div>
            {inactive.map((p) => (
              <PersonRow key={p.id} p={p} selfId={selfId} realGrants={realGrants} workspaces={workspaces} brands={brands} brandWorkspace={brandWorkspace} onPassword={(pw) => setReveal({ email: p.email, password: pw })} onError={setError} dim />
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}

function PersonRow({ p, selfId, realGrants, workspaces, brands, brandWorkspace, onPassword, onError, dim }: {
  p: Person; selfId: string; realGrants: Grant[]; workspaces: Named[]; brands: (Named & { workspace_id: string })[]; brandWorkspace: (id: string) => string | undefined;
  onPassword: (pw: string) => void; onError: (e: string | null) => void; dim?: boolean;
}) {
  const router = useRouter();
  const [granting, setGranting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.display_name);
  const [confirm, setConfirm] = useState<"deactivate" | "reset" | null>(null);
  const [pending, start] = useTransition();
  const manageable = canManagePerson(realGrants, selfId, p.id, p.grants, brandWorkspace);
  const isSelf = p.id === selfId;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; temporaryPassword?: string }>) =>
    start(async () => {
      onError(null);
      const r = await fn();
      if (!r.ok) onError(r.error ?? "Something went wrong.");
      else {
        if (r.temporaryPassword) onPassword(r.temporaryPassword);
        setConfirm(null);
        setGranting(false);
        setRenaming(false);
        router.refresh();
      }
    });

  return (
    <div className={cn("grid grid-cols-1 gap-3 border-t border-rule py-4 lg:grid-cols-[minmax(220px,1.2fr)_2fr_auto] lg:items-start lg:gap-6", dim && "opacity-60")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        {renaming ? (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => renamePerson(p.id, name)); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-8 border-b border-border-strong bg-transparent font-display text-[22px] font-semibold text-ink outline-none focus:border-gold" autoFocus aria-label="Display name" />
            <Button size="sm" variant="primary" type="submit" disabled={pending}>Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setRenaming(false); setName(p.display_name); }}>Cancel</Button>
          </form>
        ) : (
          <span className="flex items-center gap-2 font-display text-[22px] leading-tight font-semibold text-ink">
            {p.display_name}
            {isSelf ? <Chip tone="gold">you</Chip> : null}
          </span>
        )}
        <span className="truncate text-[13px] text-ink-3">{p.email}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {p.grants.map((g) => {
          const removable = manageable && !isSelf && canManageGrant(realGrants, g, brandWorkspace);
          return (
            <span key={g.id} className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-border-strong px-2.5 text-xs leading-none text-ink-2">
              {grantLabel(g, workspaces, brands)}
              {removable ? (
                <button type="button" onClick={() => run(() => removeGrant(g.id))} disabled={pending} className="text-ink-3 hover:text-coral" aria-label={`Remove ${grantLabel(g, workspaces, brands)}`}><X size={11} /></button>
              ) : null}
            </span>
          );
        })}
        {p.grants.length === 0 ? <span className="text-xs text-ink-3">no role</span> : null}
        {manageable && !isSelf ? (
          granting ? (
            <GrantPicker workspaces={workspaces} brands={brands} realGrants={realGrants} onCancel={() => setGranting(false)} onPick={(g) => run(() => addGrant(p.id, g))} />
          ) : (
            <button type="button" onClick={() => setGranting(true)} className="inline-flex items-center gap-1 text-xs text-gold-light hover:text-gold"><Plus size={11} /> role</button>
          )
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {manageable && !isSelf ? (
          confirm ? (
            <>
              <span className="text-[13px] text-ink-3">{confirm === "deactivate" ? "Deactivate this account?" : "Issue a new temporary password?"}</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => (confirm === "deactivate" ? setPersonActive(p.id, false) : resetPassword(p.id)))} className={confirm === "deactivate" ? "border-coral text-coral hover:bg-coral/10" : undefined}>
                {confirm === "deactivate" ? "Deactivate" : "Reset"}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => setRenaming(true)}>Rename</Button>
              <Button size="sm" onClick={() => setConfirm("reset")}>Reset password</Button>
              {p.is_active ? <Button size="sm" onClick={() => setConfirm("deactivate")}>Deactivate</Button> : <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => setPersonActive(p.id, true))}>Reactivate</Button>}
            </>
          )
        ) : isSelf ? (
          <span className="text-[13px] text-ink-3">Change your own name and password under Account.</span>
        ) : (
          <span className="text-[13px] text-ink-3">Outside your workspaces.</span>
        )}
      </div>
    </div>
  );
}

function GrantPicker({ workspaces, brands, realGrants, onPick, onCancel }: { workspaces: Named[]; brands: (Named & { workspace_id: string })[]; realGrants: Grant[]; onPick: (g: GrantInput) => void; onCancel: () => void }) {
  const owner = isOwner(realGrants);
  const roles = owner ? ROLES : (["brand_rep", "watchmaker"] as MemberRole[]);
  const [role, setRole] = useState<MemberRole>("watchmaker");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const sel = "h-full appearance-none bg-transparent pr-4 text-xs text-ink outline-none [&>option]:bg-panel";
  const caret = "pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ink-3";
  const grant = (): GrantInput => (role === "owner" ? { role } : role === "admin" ? { role, workspace_id: workspaceId } : { role, brand_id: brandId });
  // One pill: role · scope · Add · ×, so it reads like the chips beside it.
  return (
    <span className="inline-flex h-7 items-stretch overflow-hidden rounded-pill border border-gold/70 bg-gold/5 text-xs leading-none">
      <span className="relative flex items-center pl-3 pr-2">
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={sel} aria-label="Role">
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <CaretUpDown size={10} className={caret} />
      </span>
      {role !== "owner" ? (
        <span className="relative flex items-center border-l border-gold/30 pl-3 pr-2">
          {role === "admin" ? (
            <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={sel} aria-label="Workspace">
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          ) : (
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={sel} aria-label="Brand">
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <CaretUpDown size={10} className={caret} />
        </span>
      ) : null}
      <button type="button" onClick={() => onPick(grant())} className="flex items-center gap-1 border-l border-gold/30 px-3 font-medium text-gold-light hover:bg-gold/12">
        <Plus size={10} /> Add
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="flex items-center border-l border-gold/30 px-2.5 text-ink-3 hover:text-coral">
        <X size={11} />
      </button>
    </span>
  );
}

function NewPerson({ workspaces, brands, realGrants, onClose, onCreated }: { workspaces: Named[]; brands: (Named & { workspace_id: string })[]; realGrants: Grant[]; onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const owner = isOwner(realGrants);
  const roles = owner ? ROLES : (["brand_rep", "watchmaker"] as MemberRole[]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("watchmaker");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = "h-10 w-full border-b border-border-strong bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-gold focus-visible:outline-none";
  const label = "flex flex-col gap-1.5 text-[11px] uppercase tracking-label text-ink-3";

  function submit() {
    setError(null);
    const grant: GrantInput = role === "owner" ? { role } : role === "admin" ? { role, workspace_id: workspaceId } : { role, brand_id: brandId };
    start(async () => {
      const r = await createPerson({ displayName: name, email, grants: [grant] });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCreated(email.trim().toLowerCase(), r.temporaryPassword ?? "");
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-5 border border-rule bg-panel p-5 sm:grid-cols-2 lg:grid-cols-4">
      <label className={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rane Smith" className={field} autoFocus required /></label>
      <label className={label}>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="rane@nodus.example" className={field} required /></label>
      <label className={label}>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className={`${field} [&>option]:bg-panel`}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </label>
      <label className={label}>
        {role === "admin" ? "Workspace" : role === "owner" ? "Scope" : "Brand"}
        {role === "owner" ? (
          <span className="flex h-10 items-center text-[15px] text-ink-3">Everything</span>
        ) : role === "admin" ? (
          <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={`${field} [&>option]:bg-panel`}>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : (
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={`${field} [&>option]:bg-panel`}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </label>
      {error ? <p role="alert" className="text-[13px] text-coral sm:col-span-2 lg:col-span-4">{error}</p> : null}
      <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
        <span className="text-[13px] text-ink-3">They sign in with the temporary password shown once after this, then change it under Account.</span>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" type="submit" disabled={pending || !name.trim() || !email.trim()}>{pending ? "Creating…" : "Create account"}</Button>
        </span>
      </div>
    </form>
  );
}

function PasswordReveal({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4 border border-gold bg-gold/5 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-label text-ink-3">Temporary password for {email}</span>
        <span className="font-mono text-xl text-ink">{password}</span>
        <span className="text-[13px] text-ink-2">Shown once. Hand it over directly; it isn&rsquo;t stored anywhere in Pivot.</span>
      </div>
      <span className="ml-auto flex gap-2">
        <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(password).catch(() => {}); setCopied(true); }}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Done</Button>
      </span>
    </div>
  );
}
