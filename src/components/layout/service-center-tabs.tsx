import Link from "next/link";
import { cn } from "@/lib/utils";

export type ServiceCenterView = "bench" | "incoming" | "closed";

/**
 * The one way to move between the three Service Center views. Same strip on
 * every view, counts always shown, so switching never feels like leaving.
 */
export function ServiceCenterTabs({
  active,
  counts,
  className,
}: {
  active: ServiceCenterView;
  counts: { bench: number | null; incoming: number | null; closed: number | null };
  className?: string;
}) {
  const tabs: { key: ServiceCenterView; href: string; label: string; count: number | null }[] = [
    { key: "bench", href: "/service-center", label: "My bench", count: counts.bench },
    { key: "incoming", href: "/service-center/incoming", label: "Incoming", count: counts.incoming },
    { key: "closed", href: "/service-center?view=closed", label: "Closed", count: counts.closed },
  ];
  return (
    <nav className={cn("flex flex-none gap-7 border-b border-rule bg-panel px-4 text-sm sm:px-8 lg:px-12", className)} aria-label="Service Center views">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 py-2.5 transition-colors", on ? "border-gold font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          >
            {t.label}
            {t.count !== null ? <span className="font-mono text-[11px] text-ink-3">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
