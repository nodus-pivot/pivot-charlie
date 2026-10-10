import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { ServiceCenterTabs } from "@/components/layout/service-center-tabs";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { buildBench, type BenchFilter, type BenchSort } from "@/features/tickets/bench";
import { BenchView } from "@/features/tickets/components/bench";
import { countTickets, listBench } from "@/features/tickets/queries";
import { countIncoming } from "@/features/intake/queries";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "My bench" };

const FILTERS: BenchFilter[] = ["all", "needs_me", "waiting", "priority", "over_14"];

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** S1: stats, tabs, filters, Needs attention pinned, then the bench by step. */
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
  const sort: BenchSort = one(sp.sort) === "newest" ? "newest" : "oldest";
  const query = one(sp.q).trim();

  const brands = await getVisibleBrands();
  const brand = brands.find((b) => b.workspace_id === ws.current!.id);
  const [rows, incomingCount, totals] = await Promise.all([
    listBench(ws.current.id, view),
    brand ? countIncoming(ws.current.id, brand.id) : Promise.resolve(null),
    countTickets(ws.current.id),
  ]);
  const bench = buildBench(rows, user.grants, { filter: view === "closed" ? "all" : filter, sort, query });
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";

  return (
    <>
      <ServiceCenterTabs active={view === "closed" ? "closed" : "bench"} counts={{ bench: totals.open, incoming: incomingCount, closed: totals.closed }} />
      <PageBand
        eyebrow={`${ws.current.name} · ${first}`}
        title={view === "closed" ? "Closed" : "My bench"}
        action={
          <ButtonLink href="/service-center/tickets/new" variant="primary">
            New ticket
          </ButtonLink>
        }
      />
      <BenchView bench={bench} view={view} filter={filter} sort={sort} query={query} />
    </>
  );
}
