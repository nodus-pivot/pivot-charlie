"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CaretDown, Eye, SignOut, UserCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { clearViewAs, setViewAs, signOut } from "@/features/auth/actions";
import { VIEW_AS_ROLES, type ViewAs } from "@/features/auth/view-as";
import type { BrandOption, Workspace } from "@/features/workspaces/queries";
import { cn } from "@/lib/utils";

type Props = {
  chip: string;
  canViewAs: boolean;
  viewingAs: ViewAs | null;
  workspaces: Workspace[];
  brands: BrandOption[];
};

const select =
  "h-9 w-full border-b border-border-strong bg-transparent text-[14px] text-ink focus:border-gold focus:outline-none [&>option]:bg-panel";

/**
 * The "Nodus · Rane · Watchmaker" chip opens a small panel: Account, View as
 * (owners and admins), Sign out. A native popover, no dialog library.
 */
export function UserMenu({ chip, canViewAs, viewingAs, workspaces, brands }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [role, setRole] = useState<ViewAs["role"]>("watchmaker");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function apply() {
    setError(null);
    start(async () => {
      const r = await setViewAs(role === "admin" ? { role, workspaceId } : { role, brandId });
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        setPicking(false);
        router.refresh();
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex items-center gap-2 text-xs uppercase tracking-label transition-colors",
          viewingAs ? "text-amber" : "text-ink-3 hover:text-ink-2",
        )}
      >
        {chip}
        <CaretDown size={12} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-3 w-72 border border-rule bg-panel p-2 text-sm normal-case tracking-normal text-ink-2"
        >
          {picking ? (
            <div className="flex flex-col gap-4 p-2">
              <p className="text-[11px] uppercase tracking-label text-ink-3">View as</p>
              <div className="flex gap-2">
                {VIEW_AS_ROLES.map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => setRole(r.role)}
                    aria-pressed={role === r.role}
                    className={cn(
                      "h-8 whitespace-nowrap border px-3 text-[13px] transition-colors",
                      role === r.role ? "border-gold bg-panel text-gold-light" : "border-border-strong text-ink-2 hover:border-gold",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {role === "admin" ? (
                <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={select} aria-label="Workspace">
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              ) : (
                <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={select} aria-label="Brand">
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              <p className="text-[12px] leading-relaxed text-amber">
                Anything you do while previewing is done with that role&rsquo;s permissions.
              </p>
              {error ? <p className="text-[12px] text-coral">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={pending} onClick={apply}>
                  {pending ? "Switching…" : "Preview"}
                </Button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col">
              <li>
                <span className="flex items-center gap-2.5 px-3 py-2 text-ink-3" aria-disabled>
                  <UserCircle size={16} /> Account <span className="ml-auto text-[11px]">soon</span>
                </span>
              </li>
              {viewingAs ? (
                <li>
                  <form action={clearViewAs}>
                    <button type="submit" className="flex w-full items-center gap-2.5 px-3 py-2 text-amber hover:bg-ground">
                      <Eye size={16} /> Exit preview
                    </button>
                  </form>
                </li>
              ) : canViewAs ? (
                <li>
                  <button type="button" onClick={() => setPicking(true)} className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-ground hover:text-ink">
                    <Eye size={16} /> View as…
                  </button>
                </li>
              ) : null}
              <li className="mt-1 border-t border-rule pt-1">
                <form action={signOut}>
                  <button type="submit" className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-ground hover:text-ink">
                    <SignOut size={16} /> Sign out
                  </button>
                </form>
              </li>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
