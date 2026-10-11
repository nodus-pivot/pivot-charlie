import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { getCurrentUser } from "@/features/auth/queries";
import { canEditOps } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { WatchDetailView } from "@/features/ops/components/watch-detail";
import { getWatch } from "@/features/ops/queries";
import { getWorkspaceContext } from "@/features/workspaces/queries";

export async function generateMetadata({ params }: PageProps<"/ops/watches/[id]">): Promise<Metadata> {
  const { id } = await params;
  const d = await getWatch(id);
  return { title: d?.watch.name ?? "Watch" };
}

export default async function WatchPage({ params }: PageProps<"/ops/watches/[id]">) {
  const [{ id }, user, ws] = await Promise.all([params, getCurrentUser(), getWorkspaceContext()]);
  if (!user) redirect(SIGN_IN_PATH);
  const detail = await getWatch(id);
  if (!detail || !ws.current) notFound();
  const fits = detail.groups.reduce((n, g) => n + g.parts.filter((p) => p.fits).length, 0);
  return (
    <>
      <PageBand
        eyebrow="Ops · Watches"
        title={detail.watch.name}
        aside={
          <span>
            {detail.watch.reference ? <span className="font-mono">{detail.watch.reference}</span> : null}
            {detail.watch.reference ? " · " : ""}
            {detail.watch.warranty_months ? `${detail.watch.warranty_months}-month warranty · ` : ""}
            {fits} parts fit{!detail.watch.is_active ? " · retired" : ""}
          </span>
        }
      />
      <WatchDetailView key={`${id}-${detail.watch.is_active}-${fits}`} detail={detail} canEdit={canEditOps(user.grants, ws.current.id)} />
    </>
  );
}
