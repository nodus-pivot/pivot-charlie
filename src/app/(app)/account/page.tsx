import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { AccountForm } from "@/features/auth/components/account-form";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";
import { grantsLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const [user, ws, brands] = await Promise.all([getCurrentUser(), getWorkspaceContext(), getVisibleBrands()]);
  if (!user) redirect(SIGN_IN_PATH);
  const roles = grantsLabel(user.realGrants, { workspaces: ws.workspaces, brands });
  return (
    <>
      <PageBand eyebrow={user.email} title="Account" />
      <AccountForm key={user.profile.display_name} displayName={user.profile.display_name} email={user.email} roles={roles} />
    </>
  );
}
