import type { Grant, MemberRole } from "@/features/pipeline";

/**
 * "View as": an owner or admin previews the app as a lesser role. The choice
 * lives in a cookie; the server client turns it into request headers that
 * app.effective_memberships() honors, so both the UI and row-level security
 * see the narrowed grants. Narrowing only; the database re-checks the right.
 */
export const VIEW_AS_COOKIE = "pivot_view_as";

export type ViewAs =
  | { role: "admin"; workspaceId: string }
  | { role: "brand_rep" | "watchmaker"; brandId: string };

export function parseViewAs(raw: string | undefined): ViewAs | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<{ role: string; workspaceId: string; brandId: string }>;
    if (v.role === "admin" && v.workspaceId) return { role: "admin", workspaceId: v.workspaceId };
    if ((v.role === "brand_rep" || v.role === "watchmaker") && v.brandId) return { role: v.role, brandId: v.brandId };
  } catch {
    /* malformed cookie: ignore */
  }
  return null;
}

export function serializeViewAs(v: ViewAs): string {
  return JSON.stringify(v);
}

/** Headers for the Supabase client. Empty when not previewing. */
export function viewAsHeaders(v: ViewAs | null): Record<string, string> {
  if (!v) return {};
  return v.role === "admin"
    ? { "x-pivot-view-as": "admin", "x-pivot-view-workspace": v.workspaceId }
    : { "x-pivot-view-as": v.role, "x-pivot-view-brand": v.brandId };
}

/** The single grant the preview stands in for. */
export function viewAsGrant(v: ViewAs): Grant {
  return v.role === "admin"
    ? { role: "admin", workspace_id: v.workspaceId, brand_id: null }
    : { role: v.role, workspace_id: null, brand_id: v.brandId };
}

/** May these real grants preview this view? Mirrors app.effective_memberships(). */
export function canPreviewAs(real: Grant[], v: ViewAs, brandWorkspace: (brandId: string) => string | undefined): boolean {
  if (real.some((g) => g.role === "owner")) return true;
  const ws = v.role === "admin" ? v.workspaceId : brandWorkspace(v.brandId);
  return !!ws && real.some((g) => g.role === "admin" && g.workspace_id === ws);
}

export const VIEW_AS_ROLES: { role: ViewAs["role"]; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "brand_rep", label: "Brand rep" },
  { role: "watchmaker", label: "Watchmaker" },
];
export type ViewAsRole = MemberRole;
