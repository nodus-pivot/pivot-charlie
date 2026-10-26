import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { getCurrentUser } from "@/features/auth/queries";
import { canOpenOpsPage } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { isOwner } from "@/features/pipeline";
import { WorkspaceSettings } from "@/features/workspaces/components/workspace-settings";
import { getWorkspaceContext, listWorkspaceBrands } from "@/features/workspaces/queries";
import { slackConfig } from "@/lib/slack";
import { mailConfig } from "@/lib/mail";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  const [user, ws] = await Promise.all([getCurrentUser(), getWorkspaceContext()]);
  if (!user) redirect(SIGN_IN_PATH);
  if (!ws.current || !canOpenOpsPage(user.grants, "workspace", ws.current.id)) redirect("/service-center");
  const brands = await listWorkspaceBrands(ws.current.id);
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";
  return (
    <>
      <PageBand eyebrow={`${ws.current.name} · ${first}`} title="Workspace" />
      <WorkspaceSettings key={ws.current.id} workspace={ws.current} brands={brands} isOwner={isOwner(user.realGrants)} slack={slackConfig()} mail={mailConfig()} myEmail={user.email} />
    </>
  );
}
