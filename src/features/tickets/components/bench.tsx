import Link from "next/link";
import { Lightning, MagnifyingGlass, Package, Watch } from "@phosphor-icons/react/dist/ssr";
import { ServiceCenterTabs } from "@/components/layout/service-center-tabs";
import { Chip, ChipLink } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { STAGE_LABELS } from "@/features/pipeline";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AGE_BAR_MAX_DAYS, BENCH_FILTERS, type Bench, type BenchFilter, type BenchSort, type BenchTicket } from "../bench";

type Props = {
  bench: Bench;
  view: "open" | "closed";
  filter: BenchFilter;
  sort: BenchSort;
  query: string;
  counts: { bench: number | null; incoming: number | null; closed: number | null };
};

function href(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/service-center?${s}` : "/service-center";
}

export function BenchView({ bench, view, filter, sort, query, counts }: Props) {
  const { stats } = bench;
  const closed = view === "closed";
  return (
    <section className="flex flex-col gap-[22px] px-4 pb-10 pt-7 sm:px-8 lg:px-12">
      {!closed ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Needs you" value={stats.needsYou.count} note={stats.needsYou.note} />
          <StatCard label="Waiting on parts" value={stats.waiting.count} note={stats.waiting.note} tone={stats.waiting.count ? "amber" : undefined} />
          <StatCard label="Over 14 days" value={stats.over14.count} note={stats.over14.note} tone={stats.over14.count ? "coral" : undefined} />
          <StatCard label="Ready to ship" value={stats.readyToShip.count} note={stats.readyToShip.note} />
        </div>
      ) : null}

      <ServiceCenterTabs active={closed ? "closed" : "bench"} counts={counts} />

      <div className="flex flex-wrap items-center gap-2">
        {!closed
          ? BENCH_FILTERS.map((f) => (
              <ChipLink key={f.key} href={href({ filter: f.key === "all" ? undefined : f.key, sort: sort === "oldest" ? undefined : sort, q: query })} active={filter === f.key}>
                {f.label} {bench.counts[f.key]}
              </ChipLink>
            ))
          : null}
        <form className="ml-auto flex items-center gap-2" action="/service-center" method="get">
          {closed ? <input type="hidden" name="view" value="closed" /> : null}
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className="flex h-[34px] items-center gap-2 border border-border-strong px-3 text-[13px] text-ink-2 focus-within:border-gold">
            <MagnifyingGlass size={14} aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search"
              aria-label="Search name, model, ticket"
              className="w-28 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none sm:w-40"
            />
          </label>
          <select
            name="sort"
            defaultValue={sort}
            aria-label="Sort"
            className="h-[34px] border border-border-strong bg-transparent px-3 text-[13px] text-ink-2 outline-none focus:border-gold [&>option]:bg-panel"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
          <button type="submit" className={buttonClasses("secondary", "sm")}>Go</button>
        </form>
      </div>

      {bench.groups.length === 0 ? (
        <p className="py-10 text-sm text-ink-3">{query || filter !== "all" ? "Nothing matches." : closed ? "No closed tickets yet." : "The bench is clear."}</p>
      ) : (
        <div className="flex flex-col">
          {bench.groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline gap-3 pb-2 pt-7">
                <span className="text-[11px] uppercase tracking-label text-ink-3">{g.label}</span>
                <span className={cn("font-mono text-xs", g.key === "attention" ? "text-coral" : "text-ink-3")}>{g.count}</span>
                {g.note ? <span className="text-xs text-coral">· {g.note}</span> : null}
              </div>
              {g.tickets.map((t) => (
                <Row key={t.id} t={t} closed={closed} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, note, tone }: { label: string; value: number; note: string; tone?: "amber" | "coral" }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xs border bg-panel px-[18px] py-4", tone === "amber" ? "border-amber" : tone === "coral" ? "border-coral" : "border-rule")}>
      <span className="text-[11px] uppercase tracking-label text-ink-3">{label}</span>
      <span className={cn("font-display text-4xl leading-none font-semibold", tone === "amber" ? "text-amber" : tone === "coral" ? "text-coral" : "text-ink")}>{value}</span>
      <span className="truncate text-xs text-ink-3">{note}</span>
    </div>
  );
}

function Row({ t, closed }: { t: BenchTicket; closed: boolean }) {
  const to = `/service-center/tickets/${t.number}`;
  const pct = Math.min(100, Math.round((t.days / AGE_BAR_MAX_DAYS) * 100));
  const barTone = t.attention ? "bg-amber" : "bg-gold";
  return (
    <div className="grid grid-cols-[52px_1fr_auto] items-center gap-x-4 gap-y-2 border-t border-rule py-3.5 sm:gap-5 lg:grid-cols-[52px_1fr_130px_140px_190px]">
      <Link href={to} className="grid size-[52px] place-items-center rounded-xs border border-rule bg-panel" aria-hidden tabIndex={-1}>
        <Watch size={22} className="text-border-strong" />
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-display text-[22px] leading-tight font-semibold text-ink">
          {t.priority ? <Lightning size={14} weight="fill" className="shrink-0 text-coral" aria-label="Priority" /> : null}
          <Link href={to} className="truncate hover:text-gold-light">{t.customer_name}</Link>
          {t.parked ? (
            <Chip tone="amber" className="hidden sm:inline-flex">
              <Package size={12} /> Waiting on {t.waiting_on?.split(",")[0].toLowerCase() ?? "part"}
            </Chip>
          ) : null}
          {t.return_to_everett ? <Chip tone="neutral" className="hidden sm:inline-flex">To Everett</Chip> : null}
        </span>
        <span className="text-[12.5px] text-ink-3">
          {t.watch_name} · <span className="font-mono">{t.number}</span>
          {t.progress ? ` · ${t.progress}` : ""}
          {closed && t.closed_at ? ` · closed ${formatDate(t.closed_at)}` : ""}
        </span>
      </div>
      <span className="hidden text-xs uppercase tracking-label text-ink-2 lg:block">{closed ? "Closed" : STAGE_LABELS[t.stage]}</span>
      {closed ? (
        <span className="hidden lg:block" />
      ) : (
        <span className={cn("hidden items-center gap-2 font-mono text-xs lg:inline-flex", t.attention ? "text-amber" : "text-ink-2")}>
          <span className="h-1 w-[60px] overflow-hidden bg-rule">
            <span className={cn("block h-full", barTone)} style={{ width: `${pct}%` }} />
          </span>
          {t.days}d
        </span>
      )}
      <span className="col-start-3 row-start-1 justify-self-end lg:col-start-auto lg:row-start-auto">
        <Link href={to} className={buttonClasses(t.next.emphasis ? "primary" : "secondary", "sm")}>
          {closed ? "Open" : t.next.label}
        </Link>
      </span>
    </div>
  );
}
