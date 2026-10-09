import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Grant } from "@/features/pipeline";
import { VIEW_AS_COOKIE, parseViewAs, viewAsGrant, type ViewAs } from "./view-as";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type CurrentUser = {
  id: string;
  email: string;
  profile: Profile;
  /** The grants in effect for this request: the real ones, or the single preview grant. */
  grants: Grant[];
  /** The person's real grants (what they can go back to). */
  realGrants: Grant[];
  /** Set while previewing as a lesser role. */
  viewingAs: ViewAs | null;
};

/**
 * The signed-in user with their profile, or null when signed out or when the
 * auth account has no profile row / is deactivated. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active) return null;

  // memberships reads go through the preview headers; the RPC returns the real ones.
  const { data: memberships } = await supabase.rpc("my_real_grants");
  const realGrants: Grant[] = (memberships ?? []).map((m) => ({ role: m.role, workspace_id: m.workspace_id, brand_id: m.brand_id }));
  const viewingAs = parseViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
  const grants = viewingAs ? [viewAsGrant(viewingAs)] : realGrants;

  return { id: user.id, email: user.email ?? profile.email, profile, grants, realGrants, viewingAs };
});
