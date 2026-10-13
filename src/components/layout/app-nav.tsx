import { Wordmark } from "@/components/layout/wordmark";
import type { CurrentUser } from "@/features/auth/queries";
import { canOpenOps, canUseViewAs } from "@/features/auth/permissions";
import type { BrandOption, WorkspaceContext } from "@/features/workspaces/queries";
import { navChip } from "@/lib/labels";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

/**
 * The 48px bar on every signed-in page: wordmark, Service Center · Ops,
 * then the "Nodus · Rane · Watchmaker" chip that opens the user menu.
 */
export function AppNav({ user, ws, brands }: { user: CurrentUser; ws: WorkspaceContext; brands: BrandOption[] }) {
  const chip = navChip(user.grants, user.profile.display_name, { workspaceName: ws.current?.name ?? null, brands });
  // Phones drop the workspace from the chip and move the module links into the menu.
  const chipShort = chip.split(" · ").slice(-2).join(" · ");
  const showOps = canOpenOps(user.grants);
  return (
    <header className="flex h-12 min-w-0 flex-none items-center gap-5 border-b border-rule bg-panel px-4 text-xs uppercase tracking-label text-ink-3 sm:gap-7 sm:px-8 lg:px-12">
      <Wordmark href="/service-center" className="text-xl" />
      <NavLinks showOps={showOps} className="hidden sm:flex" />
      <div className="ml-auto min-w-0">
        <UserMenu
          chip={chip}
          chipShort={chipShort}
          showOps={showOps}
          canViewAs={canUseViewAs(user.realGrants)}
          viewingAs={user.viewingAs}
          workspaces={ws.workspaces}
          brands={brands}
        />
      </div>
    </header>
  );
}
