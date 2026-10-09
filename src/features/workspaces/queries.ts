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

/** The one address shape used everywhere. */
export type Address = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export function addressLines(a: Address | null | undefined): string[] {
  if (!a) return [];
  const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
  return [a.line1, a.line2, cityLine, a.country].filter((l): l is string => !!l && l.trim().length > 0);
}

/** "77 Grand Ave · Los Angeles, CA 90013" — the dossier's one-line form. */
export function addressInline(a: Address | null | undefined): string {
  if (!a) return "";
  const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
  return [a.line1, cityLine].filter((l) => l && l.trim().length > 0).join(" · ");
}

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
