import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { getCurrentUser } from "@/features/auth/queries";
import { canEditOps } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { WatchList } from "@/features/ops/components/watch-list";
import { listWatches } from "@/features/ops/queries";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "Watches" };

export default async function WatchesPage() {
  const [user, ws, brands] = await Promise.all([getCurrentUser(), getWorkspaceContext(), getVisibleBrands()]);
  if (!user) redirect(SIGN_IN_PATH);
  const brand = brands.find((b) => b.workspace_id === ws.current?.id);
  if (!ws.current || !brand) redirect("/service-center");
  const rows = await listWatches(brand.id);
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";
  return (
    <>
      <PageBand eyebrow={`${ws.current.name} · ${first}`} title="Watches" />
      <WatchList rows={rows} brandId={brand.id} canEdit={canEditOps(user.grants, ws.current.id)} />
    </>
  );
}
