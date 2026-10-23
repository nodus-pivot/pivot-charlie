import type { Database } from "@/lib/supabase/database.types";

/**
 * Pure pipeline vocabulary: stages, roles, grants. No React, no Supabase
 * calls. Everything here mirrors the database enums and app.* helpers.
 */

export type Stage = Database["public"]["Enums"]["stage"];
export type MemberRole = Database["public"]["Enums"]["member_role"];
/** The seven steps a ticket walks through; `closed` is the end state, not a step. */
export type Step = Exclude<Stage, "closed">;

export type Grant = { role: MemberRole; workspace_id: string | null; brand_id: string | null };

/** Stage order, as the step rail shows it. */
export const STAGES: Stage[] = ["check_in", "inspect", "supply", "repair", "test", "payment", "ship", "closed"];
export const STEPS: Step[] = ["check_in", "inspect", "supply", "repair", "test", "payment", "ship"];

export const STAGE_LABELS: Record<Stage, string> = {
  check_in: "Check in",
  inspect: "Inspect",
  supply: "Supply",
  repair: "Repair",
  test: "Test",
  payment: "Payment",
  ship: "Ship",
  closed: "Closed",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  brand_rep: "Brand rep",
  watchmaker: "Watchmaker",
};

export const TEST_KINDS = ["time", "water", "looks"] as const;
export type TestKind = (typeof TEST_KINDS)[number];
export const TEST_LABELS: Record<TestKind, string> = { time: "Timekeeping", water: "Water resistance", looks: "Looks" };

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/** The step after this one; Payment is skipped on a warranty ticket. */
export function nextStage(stage: Stage, needsPayment: boolean): Stage | null {
  const next = STAGES[stageIndex(stage) + 1] ?? null;
  return next === "payment" && !needsPayment ? "ship" : next;
}

/** The step before this one, for "Back to <previous>". */
export function previousStep(stage: Stage, needsPayment: boolean): Step | null {
  const ix = stageIndex(stage);
  if (ix <= 0) return null;
  const prev = STAGES[ix - 1] as Step;
  return prev === "payment" && !needsPayment ? "test" : prev;
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
