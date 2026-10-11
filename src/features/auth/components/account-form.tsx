"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input, Label } from "@/components/ui/field";
import { changePassword, updateDisplayName } from "../actions";

type Props = { displayName: string; email: string; roles: string };

/** /account: who you are, your name (editable), and a password change that asks for the current one. */
export function AccountForm({ displayName, email, roles }: Props) {
  return (
    <section className="flex flex-col gap-12 px-4 pb-12 pt-7 sm:px-8 lg:px-12">
      <div className="grid max-w-[980px] gap-x-14 gap-y-10 lg:grid-cols-2">
        <NameForm displayName={displayName} email={email} roles={roles} />
        <PasswordForm />
      </div>
    </section>
  );
}

function NameForm({ displayName, email, roles }: Props) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = name.trim() !== displayName;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    start(async () => {
      const r = await updateDisplayName({ displayName: name });
      if (!r.ok) setError(r.error);
      else {
        setStatus("Saved");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Eyebrow>Profile</Eyebrow>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Name</Label>
        <Input id="display_name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        <span className="text-[12px] text-ink-3">Shown in the header chip and on ticket comments and events.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Email</Label>
        <span className="h-11 border-b border-rule text-[15px] leading-[44px] text-ink-2">{email}</span>
        <span className="text-[12px] text-ink-3">Used to sign in. Ask an owner to change it.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Access</Label>
        <span className="text-[15px] text-ink-2">{roles}</span>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending || !dirty}>{pending ? "Saving…" : "Save name"}</Button>
        {status ? <span className="text-[13px] text-green">{status}</span> : null}
        {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    start(async () => {
      const r = await changePassword({ current, next, confirm });
      if (!r.ok) setError(r.error);
      else {
        setStatus("Password changed");
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" autoComplete="off">
      <Eyebrow>Password</Eyebrow>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current_password">Current password</Label>
        <Input id="current_password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new_password">New password</Label>
        <Input id="new_password" type="password" autoComplete="new-password" minLength={12} value={next} onChange={(e) => setNext(e.target.value)} required />
        <span className="text-[12px] text-ink-3">At least 12 characters.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm_password">New password again</Label>
        <Input id="confirm_password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!confirm && confirm !== next} required />
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending || !current || !next || !confirm}>{pending ? "Changing…" : "Change password"}</Button>
        {status ? <span className="text-[13px] text-green">{status}</span> : null}
        {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
      </div>
    </form>
  );
}
