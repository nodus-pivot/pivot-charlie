import "server-only";
import type { Grant } from "@/features/pipeline";
import { createClient } from "@/lib/supabase/server";

export type Person = {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  grants: (Grant & { id: string })[];
};

/** Everyone the caller may see (RLS: shares a workspace through some grant), with their grants. */
export async function listPeople(): Promise<Person[]> {
  const supabase = await createClient();
  const [{ data: profiles, error }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, is_active, created_at").order("display_name"),
    supabase.from("memberships").select("id, user_id, role, workspace_id, brand_id"),
  ]);
  if (error) throw error;
  const byUser = new Map<string, (Grant & { id: string })[]>();
  for (const m of memberships ?? []) {
    byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), { id: m.id, role: m.role, workspace_id: m.workspace_id, brand_id: m.brand_id }]);
  }
  return (profiles ?? []).map((p) => ({ ...p, grants: byUser.get(p.id) ?? [] }));
}
