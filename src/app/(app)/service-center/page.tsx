import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { ServiceCenterTabs } from "@/components/layout/service-center-tabs";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { buildBench, buildClosed, CLOSED_FILTERS, type BenchFilter, type BenchSort, type ClosedFilter } from "@/features/tickets/bench";
import { BenchView } from "@/features/tickets/components/bench";
import { countTickets, listBench } from "@/features/tickets/queries";
import { countIncoming } from "@/features/intake/queries";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "My bench" };

const FILTERS: BenchFilter[] = ["all", "needs_me", "parked", "priority", "payment"];

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** D0: stats, tabs, filters, Parked pinned first, then the bench by step. D13: closed tickets by month. */
export default async function ServiceCenterPage({ searchParams }: PageProps<"/service-center">) {
  const [user, ws, sp] = await Promise.all([getCurrentUser(), getWorkspaceContext(), searchParams]);
  if (!user) redirect(SIGN_IN_PATH);
  if (!ws.current) {
    return (
      <>
        <PageBand eyebrow="Pivot" title="No workspace" />
        <p className="px-12 py-7 text-sm text-ink-3">Your account has no workspace yet. Ask an owner.</p>
      </>
    );
  }

  const view = one(sp.view) === "closed" ? "closed" : "open";
  const filter = (FILTERS.find((f) => f === one(sp.filter)) ?? "all") as BenchFilter;
  const closedFilter = (CLOSED_FILTERS.find((f) => f.key === one(sp.filter))?.key ?? "all") as ClosedFilter;
  const sort: BenchSort = one(sp.sort) === "newest" ? "newest" : "oldest";
  const query = one(sp.q).trim();

  const brands = await getVisibleBrands();
  const brand = brands.find((b) => b.workspace_id === ws.current!.id);
  const [rows, incomingCount, totals] = await Promise.all([
    listBench(ws.current.id, view),
    brand ? countIncoming(ws.current.id) : Promise.resolve(null),
    countTickets(ws.current.id),
  ]);
  const bench = buildBench(rows, user.grants, { filter: view === "closed" ? "all" : filter, sort, query });
  const closedList = view === "closed" ? buildClosed(rows, user.grants, { filter: closedFilter, query }) : null;
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";

  return (
    <>
      <ServiceCenterTabs active={view === "closed" ? "closed" : "bench"} counts={{ bench: totals.open, incoming: incomingCount, closed: totals.closed }} />
      <PageBand
        eyebrow={`${ws.current.name} · ${first}`}
        title={view === "closed" ? "Closed" : "My bench"}
        aside={closedList ? <span className="text-base text-ink-2">{closedList.stats.thisYear} this year{closedList.stats.avgDays != null ? ` · avg ${closedList.stats.avgDays} days bench to ship` : ""}</span> : undefined}
        action={
          <ButtonLink href="/service-center/tickets/new" variant="primary">
            New ticket
          </ButtonLink>
        }
      />
      <BenchView bench={bench} view={view} filter={filter} closedFilter={closedFilter} closedGroups={closedList?.groups ?? []} closedCounts={closedList?.counts ?? { all: 0, warranty: 0, paid: 0, nothing_wrong: 0 }} sort={sort} query={query} />
    </>
  );
}
