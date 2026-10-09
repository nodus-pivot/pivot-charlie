import { isAdminOf, isOwner, type Grant } from "@/features/pipeline";

/**
 * The permission table. Every nav item, page and server action asks here;
 * the database enforces the same rules through RLS and the app.* helpers.
 */

/** Ops as a module: owners, admins, and anyone with a brand grant (read-only pages for them). */
export function canOpenOps(grants: Grant[]): boolean {
  return grants.length > 0;
}

/** Owners and admins of at least one workspace. */
export function isAnyAdmin(grants: Grant[]): boolean {
  return isOwner(grants) || grants.some((g) => g.role === "admin");
}

export function canAdministerWorkspace(grants: Grant[], workspaceId: string): boolean {
  return isAdminOf(grants, workspaceId);
}

/** Work Incoming and create tickets: admins of the workspace, or anyone with a brand grant in it. Mirrors app.can_intake(). */
export function canIntake(grants: Grant[], workspaceId: string, brandWorkspace: (brandId: string) => string | undefined): boolean {
  return isAdminOf(grants, workspaceId) || grants.some((g) => g.brand_id && brandWorkspace(g.brand_id) === workspaceId);
}

/** Only brand-level grants, no admin or owner: the bench view. */
export function isBenchOnly(grants: Grant[]): boolean {
  return grants.length > 0 && grants.every((g) => g.role === "watchmaker");
}

export type OpsPage = "watches" | "components" | "users" | "workspace";

/** Which Ops pages the person may open. Catalog pages are visible to everyone in scope; people and workspace are admin-only. */
export function canOpenOpsPage(grants: Grant[], page: OpsPage, workspaceId: string): boolean {
  const admin = isAdminOf(grants, workspaceId);
  switch (page) {
    case "watches":
    case "components":
      return admin || grants.some((g) => !!g.brand_id);
    case "users":
    case "workspace":
      return admin;
  }
}

/** Only owners and admins edit anything in Ops. */
export function canEditOps(grants: Grant[], workspaceId: string): boolean {
  return isAdminOf(grants, workspaceId);
}

/** Preview as a lesser role: owners anywhere, admins inside their workspaces. */
export function canUseViewAs(realGrants: Grant[]): boolean {
  return isAnyAdmin(realGrants);
}
