import { redirect } from "next/navigation";
import { OpsTabs, type OpsView } from "@/components/layout/ops-tabs";
import { getCurrentUser } from "@/features/auth/queries";
import { canOpenOps, canOpenOpsPage } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { getWorkspaceContext } from "@/features/workspaces/queries";

/** Ops pages share the fixed tab strip under the nav; which tabs show depends on the role. */
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  const [user, ws] = await Promise.all([getCurrentUser(), getWorkspaceContext()]);
  if (!user) redirect(SIGN_IN_PATH);
  if (!ws.current || !canOpenOps(user.grants)) redirect("/service-center");
  const show = (["users", "workspace"] as OpsView[]).filter((p) => canOpenOpsPage(user.grants, p, ws.current!.id));
  return (
    <>
      <OpsTabs show={show} />
      {children}
    </>
  );
}
