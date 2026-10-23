import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const WORKSPACE_COOKIE = "pivot_ws";

export type Workspace = Pick<
  Database["public"]["Tables"]["workspaces"]["Row"],
  "id" | "name" | "slug" | "ticket_prefix" | "bench_address" | "fulfillment_address"
>;

export { addressInline, addressLines, type Address } from "@/lib/address";

export type WorkspaceContext = {
  /** Every workspace the user can see, per RLS. */
  workspaces: Workspace[];
  /** The one they are working in: the cookie's choice if visible, else the oldest. */
  current: Workspace | null;
};

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id, name, slug, ticket_prefix, bench_address, fulfillment_address")
    .order("created_at");
  const workspaces = data ?? [];
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const current = workspaces.find((w) => w.id === wanted) ?? workspaces[0] ?? null;
  return { workspaces, current };
});

export type BrandOption = { id: string; name: string; workspace_id: string };

/** Every brand the caller can see, with its workspace. Used for names and the View-as picker. */
export const getVisibleBrands = cache(async (): Promise<BrandOption[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("id, name, workspace_id").eq("is_active", true).order("name");
  return data ?? [];
});

export type BrandSummary = { id: string; name: string; slug: string; is_active: boolean; slack_channel_id: string | null; tickets: number };

/** The brands under a workspace with how many open tickets each carries. Admin-only page. */
export async function listWorkspaceBrands(workspaceId: string): Promise<BrandSummary[]> {
  const supabase = await createClient();
  const [{ data: brands, error }, { data: tickets }] = await Promise.all([
    supabase.from("brands").select("id, name, slug, is_active, slack_channel_id").eq("workspace_id", workspaceId).order("name"),
    supabase.from("tickets").select("brand_id").eq("workspace_id", workspaceId).neq("stage", "closed"),
  ]);
  if (error) throw error;
  const by = new Map<string, number>();
  for (const t of tickets ?? []) by.set(t.brand_id, (by.get(t.brand_id) ?? 0) + 1);
  return (brands ?? []).map((b) => ({ ...b, tickets: by.get(b.id) ?? 0 }));
}
