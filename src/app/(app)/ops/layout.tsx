import { redirect } from "next/navigation";
import { OpsTabs, type OpsView } from "@/components/layout/ops-tabs";
import { getCurrentUser } from "@/features/auth/queries";
import { canOpenOps, canOpenOpsPage } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { getWorkspaceContext } from "@/features/workspaces/queries";
import { headers } from "next/headers";

/** Ops pages share the fixed tab strip under the nav; which tabs show depends on the role. */
export default async function OpsLayout({ children }: LayoutProps<"/ops">) {
  const [user, ws] = await Promise.all([getCurrentUser(), getWorkspaceContext()]);
  if (!user) redirect(SIGN_IN_PATH);
  if (!ws.current || !canOpenOps(user.grants)) redirect("/service-center");
  const show = (["watches", "components", "users", "workspace"] as OpsView[]).filter((p) => canOpenOpsPage(user.grants, p, ws.current!.id));
  const path = (await headers()).get("x-pathname") ?? "";
  const active = (show.find((p) => path.startsWith(`/ops/${p}`)) ?? "watches") as OpsView;
  return (
    <>
      <OpsTabs active={active} show={show} />
      {children}
    </>
  );
}
