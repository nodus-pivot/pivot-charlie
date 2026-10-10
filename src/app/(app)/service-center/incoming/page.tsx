import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ServiceCenterTabs } from "@/components/layout/service-center-tabs";
import { Eyebrow } from "@/components/ui/eyebrow";
import { countTickets } from "@/features/tickets/queries";
import { getCurrentUser } from "@/features/auth/queries";
import { canIntake } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { IncomingView } from "@/features/intake/components/incoming";
import { listIncoming } from "@/features/intake/queries";
import { monthTabTitle } from "@/features/intake/sheet";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "Incoming watches" };

/** T1: the sheet queue on the left, the selected row mapped into ticket fields on the right. */
export default async function IncomingPage({ searchParams }: PageProps<"/service-center/incoming">) {
  const [user, ws, brands, sp] = await Promise.all([getCurrentUser(), getWorkspaceContext(), getVisibleBrands(), searchParams]);
  if (!user) redirect(SIGN_IN_PATH);
  const brand = brands.find((b) => b.workspace_id === ws.current?.id);
  const brandWorkspace = (id: string) => brands.find((b) => b.id === id)?.workspace_id;
  if (!ws.current || !brand || !canIntake(user.grants, ws.current.id, brandWorkspace)) {
    return (
      <section className="px-12 py-9">
        <Eyebrow>Incoming</Eyebrow>
        <p className="mt-4 text-sm text-ink-3">Your role can&rsquo;t work the incoming queue.</p>
      </section>
    );
  }

  let queue;
  try {
    queue = await listIncoming(ws.current.id, brand.id, { force: sp.refresh === "1" });
  } catch (e) {
    return (
      <section className="px-12 py-9">
        <Eyebrow>Incoming · {brand.name}</Eyebrow>
        <h1 className="mt-4 font-display text-[34px] font-semibold text-ink">The sheet can&rsquo;t be read right now</h1>
        <p className="mt-3 max-w-xl text-sm text-ink-2">{e instanceof Error ? e.message : String(e)}</p>
        <p className="mt-2 text-sm text-ink-3">Check that the sheet is shared with the service account as an Editor, then reload.</p>
      </section>
    );
  }

  const totals = await countTickets(ws.current.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh_-_3rem)] lg:flex-none">
      <ServiceCenterTabs active="incoming" counts={{ bench: totals.open, incoming: queue.rows.length, closed: totals.closed }} className="flex-none px-4 sm:px-8 lg:px-12" />
      <IncomingView
      rows={queue.rows}
      catalog={queue.catalog}
      brandId={brand.id}
      brandName={brand.name}
      syncedAt={queue.syncedAt.toISOString()}
      stale={queue.stale}
      pendingMoves={queue.pendingMoves}
      monthTab={monthTabTitle()}
      initialSelected={typeof sp.row === "string" ? sp.row : undefined}
      />
    </div>
  );
}
