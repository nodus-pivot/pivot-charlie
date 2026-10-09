import { ROLE_LABELS, type Grant } from "@/features/pipeline";

type Named = { id: string; name: string };

/**
 * The nav chip: "Nodus · Rane · Watchmaker". Workspace (or brand's workspace),
 * first name, then the role. Several grants collapse to the highest one.
 */
export function navChip(
  grants: Grant[],
  displayName: string,
  ctx: { workspaceName: string | null; brands: (Named & { workspace_id: string })[] },
): string {
  const first = displayName.trim().split(/\s+/)[0] ?? displayName;
  const roleRank: Grant["role"][] = ["owner", "admin", "watchmaker", "brand_rep"];
  const top = [...grants].sort((a, b) => roleRank.indexOf(a.role) - roleRank.indexOf(b.role))[0];
  const role = top ? ROLE_LABELS[top.role] : "Guest";
  return [ctx.workspaceName, first, role].filter(Boolean).join(" · ");
}

/** A readable list of grants for the preview banner: "Watchmaker, Nodus". */
export function grantsLabel(grants: Grant[], ctx: { workspaces: Named[]; brands: Named[] }): string {
  const name = (list: Named[], id: string | null) => list.find((x) => x.id === id)?.name;
  const parts = grants.map((g) => {
    const scope = g.role === "admin" ? name(ctx.workspaces, g.workspace_id) : name(ctx.brands, g.brand_id);
    return scope ? `${ROLE_LABELS[g.role]}, ${scope}` : ROLE_LABELS[g.role];
  });
  return parts.length ? parts.join(" · ") : "no role";
}
