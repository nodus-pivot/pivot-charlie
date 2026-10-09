import { redirect } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";
import { grantsLabel } from "@/lib/labels";

/** Every signed-in page: the nav bar, the preview banner when active, then the page. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const [ws, brands] = await Promise.all([getWorkspaceContext(), getVisibleBrands()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav user={user} ws={ws} brands={brands} />
      {user.viewingAs ? (
        <p className="flex-none border-b border-amber/40 bg-amber/10 px-4 py-1.5 text-center text-[13px] text-amber">
          Previewing as {grantsLabel(user.grants, { workspaces: ws.workspaces, brands })}. Everything you see and do is with
          that role&rsquo;s permissions.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
