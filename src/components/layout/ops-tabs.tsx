import Link from "next/link";
import { cn } from "@/lib/utils";

export type OpsView = "watches" | "components" | "users" | "workspace";

/** Same fixed strip as Service Center: under the nav, on every Ops view. */
export function OpsTabs({ active, show }: { active: OpsView; show: OpsView[] }) {
  const tabs: { key: OpsView; href: string; label: string }[] = [
    { key: "watches", href: "/ops/watches", label: "Watches" },
    { key: "components", href: "/ops/components", label: "Components" },
    { key: "users", href: "/ops/users", label: "Users" },
    { key: "workspace", href: "/ops/workspace", label: "Workspace" },
  ];
  return (
    <nav className="flex flex-none gap-7 border-b border-rule bg-panel px-4 text-sm sm:px-8 lg:px-12" aria-label="Ops views">
      {tabs.filter((t) => show.includes(t.key)).map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 py-2.5 transition-colors", on ? "border-gold font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
