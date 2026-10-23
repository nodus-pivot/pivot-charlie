import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { getCurrentUser } from "@/features/auth/queries";
import { canOpenOpsPage } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { UsersView } from "@/features/people/components/users-view";
import { listPeople } from "@/features/people/queries";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const [user, ws, brands] = await Promise.all([getCurrentUser(), getWorkspaceContext(), getVisibleBrands()]);
  if (!user) redirect(SIGN_IN_PATH);
  if (!ws.current || !canOpenOpsPage(user.grants, "users", ws.current.id)) redirect("/service-center");
  const people = await listPeople();
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";
  return (
    <>
      <PageBand eyebrow={`${ws.current.name} · ${first}`} title="Users" />
      <UsersView people={people} selfId={user.id} realGrants={user.realGrants} workspaces={ws.workspaces.map((w) => ({ id: w.id, name: w.name }))} brands={brands} />
    </>
  );
}
