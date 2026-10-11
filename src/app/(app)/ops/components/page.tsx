import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/queries";
import { canEditOps } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { COMPONENTS, type Component } from "@/features/pipeline";
import { ComponentsView } from "@/features/ops/components/components-view";
import { listParts } from "@/features/ops/queries";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "Components" };

/** O3: the parts library. Selection lives in the URL so a part can be linked to. */
export default async function ComponentsPage({ searchParams }: PageProps<"/ops/components">) {
  const [user, ws, brands, sp] = await Promise.all([getCurrentUser(), getWorkspaceContext(), getVisibleBrands(), searchParams]);
  if (!user) redirect(SIGN_IN_PATH);
  const brand = brands.find((b) => b.workspace_id === ws.current?.id);
  if (!ws.current || !brand) redirect("/service-center");
  const { parts, watches } = await listParts(brand.id);
  const type = (COMPONENTS.find((c) => c === sp.type) ?? "bezel") as Component;
  const partId = typeof sp.part === "string" && parts.some((p) => p.id === sp.part) ? sp.part : null;
  const selectedType = partId ? parts.find((p) => p.id === partId)!.component : type;
  return (
    <ComponentsView
      key={`${selectedType}-${partId ?? ""}`}
      parts={parts}
      watches={watches}
      brandId={brand.id}
      selectedType={selectedType}
      selectedPartId={partId}
      canEdit={canEditOps(user.grants, ws.current.id)}
    />
  );
}
