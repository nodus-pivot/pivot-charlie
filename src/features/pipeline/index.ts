import type { Database } from "@/lib/supabase/database.types";

/**
 * Pure pipeline vocabulary: stages, roles, grants. No React, no Supabase
 * calls. Everything here mirrors the database enums and app.* helpers.
 */

export type Stage = Database["public"]["Enums"]["stage"];
export type MemberRole = Database["public"]["Enums"]["member_role"];
export type Component = Database["public"]["Enums"]["component"];

export type Grant = { role: MemberRole; workspace_id: string | null; brand_id: string | null };

/** Stage order, as the step rail shows it. */
export const STAGES: Stage[] = ["check_in", "inspect", "supply", "fix", "test", "ship", "closed"];

export const STAGE_LABELS: Record<Stage, string> = {
  check_in: "Check in",
  inspect: "Inspect",
  supply: "Supply",
  fix: "Fix",
  test: "Test",
  ship: "Ship",
  closed: "Closed",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  brand_rep: "Brand rep",
  watchmaker: "Watchmaker",
};

/** The twelve components, alphabetical so a chip is easy to find. */
export const COMPONENTS: Component[] = [
  "bezel", "case", "caseback", "clasp", "crown", "crystal", "dial", "gaskets", "hands", "lume", "movement", "strap",
];

export const COMPONENT_LABELS: Record<Component, string> = {
  bezel: "Bezel",
  crystal: "Crystal",
  crown: "Crown",
  case: "Case",
  caseback: "Caseback",
  dial: "Dial",
  hands: "Hands",
  movement: "Movement",
  gaskets: "Gaskets",
  strap: "Strap",
  clasp: "Clasp",
  lume: "Lume",
};

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function isOwner(grants: Grant[]): boolean {
  return grants.some((g) => g.role === "owner");
}

/** Owner anywhere, or admin of this workspace. Mirrors app.is_admin_of(). */
export function isAdminOf(grants: Grant[], workspaceId: string): boolean {
  return isOwner(grants) || grants.some((g) => g.role === "admin" && g.workspace_id === workspaceId);
}

/** The brands a person holds at brand level (rep or watchmaker). */
export function brandIds(grants: Grant[]): string[] {
  return grants.flatMap((g) => (g.brand_id ? [g.brand_id] : []));
}

/** Which stages a role may act on. Mirrors app.can_act_on(). */
export function canActOn(grants: Grant[], stage: Stage, workspaceId: string, brandId: string): boolean {
  if (isAdminOf(grants, workspaceId)) return true;
  const bench = grants.some((g) => g.role === "watchmaker" && g.brand_id === brandId);
  if (bench && stage !== "closed") return true;
  const rep = grants.some((g) => g.role === "brand_rep" && g.brand_id === brandId);
  return rep && stage === "check_in";
}
