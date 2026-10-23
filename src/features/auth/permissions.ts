import { isAdminOf, isOwner, type Grant } from "@/features/pipeline";

/**
 * The permission table. Every nav item, page and server action asks here;
 * the database enforces the same rules through RLS and the app.* helpers.
 */

/** Ops as a module: owners and admins. The catalog pages are gone, so brand-level roles have nothing to see there. */
export function canOpenOps(grants: Grant[]): boolean {
  return isAnyAdmin(grants);
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

export type OpsPage = "users" | "workspace";

/** Which Ops pages the person may open: both are admin-only. */
export function canOpenOpsPage(grants: Grant[], page: OpsPage, workspaceId: string): boolean {
  void page;
  return isAdminOf(grants, workspaceId);
}

/** Preview as a lesser role: owners anywhere, admins inside their workspaces. */
export function canUseViewAs(realGrants: Grant[]): boolean {
  return isAnyAdmin(realGrants);
}

/* ---------------------------------------------------------------- people */

/** Mirrors app.membership_manageable(): owners grant anything; admins grant brand roles inside their workspaces. */
export function canManageGrant(grants: Grant[], target: Grant, brandWorkspace: (brandId: string) => string | undefined): boolean {
  if (isOwner(grants)) return true;
  if (target.role !== "brand_rep" && target.role !== "watchmaker") return false;
  const ws = target.brand_id ? brandWorkspace(target.brand_id) : undefined;
  return !!ws && isAdminOf(grants, ws);
}

/** Mirrors app.can_manage_user(): someone else, and every grant they hold is one the caller could manage. */
export function canManagePerson(grants: Grant[], selfId: string, personId: string, personGrants: Grant[], brandWorkspace: (brandId: string) => string | undefined): boolean {
  if (selfId === personId) return false;
  if (isOwner(grants)) return true;
  return personGrants.every((g) => canManageGrant(grants, g, brandWorkspace));
}
