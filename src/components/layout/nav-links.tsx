"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/service-center", label: "Service Center" },
  { href: "/ops", label: "Ops", opsOnly: true },
] as const;

/** Uppercase, tracked; the active one is ink with a 1px gold underline. */
export function NavLinks({ showOps }: { showOps: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-5 sm:gap-7">
      {LINKS.filter((l) => !("opsOnly" in l) || showOps).map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b pb-0.5 transition-colors",
              active ? "border-gold text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
