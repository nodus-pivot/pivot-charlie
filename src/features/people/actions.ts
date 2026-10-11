"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageGrant, canManagePerson, isAnyAdmin } from "@/features/auth/permissions";
import { getCurrentUser } from "@/features/auth/queries";
import type { Grant } from "@/features/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PeopleResult = { ok: true; temporaryPassword?: string } | { ok: false; error: string };

/** 16 url-safe characters, above the 12-character minimum. Shown once, never stored by us. */
function temporaryPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

const grantSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("owner") }),
  z.object({ role: z.literal("admin"), workspace_id: z.uuid() }),
  z.object({ role: z.enum(["brand_rep", "watchmaker"]), brand_id: z.uuid() }),
]);
export type GrantInput = z.infer<typeof grantSchema>;

function toGrant(g: GrantInput): Grant {
  if (g.role === "owner") return { role: "owner", workspace_id: null, brand_id: null };
  if (g.role === "admin") return { role: "admin", workspace_id: g.workspace_id, brand_id: null };
  return { role: g.role, workspace_id: null, brand_id: g.brand_id };
}

async function context() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "You're signed out." };
  if (user.viewingAs) return { ok: false as const, error: "Exit the preview to manage people." };
  if (!isAnyAdmin(user.realGrants)) return { ok: false as const, error: "Only owners and admins manage people." };
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, workspace_id");
  const brandWorkspace = (id: string) => brands?.find((b) => b.id === id)?.workspace_id;
  return { ok: true as const, user, supabase, brandWorkspace };
}

async function personGrants(supabase: Awaited<ReturnType<typeof createClient>>, personId: string): Promise<Grant[]> {
  const { data } = await supabase.from("memberships").select("role, workspace_id, brand_id").eq("user_id", personId);
  return (data ?? []).map((m) => ({ role: m.role, workspace_id: m.workspace_id, brand_id: m.brand_id }));
}

const personInput = z.object({
  displayName: z.string().trim().min(1, "Enter their name.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  grants: z.array(grantSchema).min(1, "Give them at least one role.").max(20),
});

/**
 * Add a person: auth account (service role), profile row (service role: no
 * insert policy by design), grants as the caller so RLS checks the right.
 * Returns the temporary password to hand over directly.
 */
export async function createPerson(raw: unknown): Promise<PeopleResult> {
  const parsed = personInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const seen = new Set<string>();
  const grants = parsed.data.grants.map(toGrant).filter((g) => {
    const key = `${g.role}|${g.workspace_id ?? ""}|${g.brand_id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (grants.some((g) => !canManageGrant(ctx.user.realGrants, g, ctx.brandWorkspace))) return { ok: false, error: "You can't grant one of those roles." };

  const admin = createAdminClient();
  const password = temporaryPassword();
  const { data: created, error } = await admin.auth.admin.createUser({ email: parsed.data.email, password, email_confirm: true, user_metadata: { display_name: parsed.data.displayName } });
  if (error || !created.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    return { ok: false, error: exists ? "Someone already has that email." : (error?.message ?? "Could not create the account.") };
  }
  const { error: e2 } = await admin.from("profiles").insert({ id: created.user.id, email: parsed.data.email, display_name: parsed.data.displayName });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: e2.message };
  }
  // Never .select() on this insert: the read policy can't see the row inside the same statement.
  const { error: e3 } = await ctx.supabase.from("memberships").insert(grants.map((g) => ({ user_id: created.user.id, ...g, created_by: ctx.user.id })));
  if (e3) return { ok: false, error: `Account created, but the grants failed: ${e3.message}` };
  revalidatePath("/ops/users");
  return { ok: true, temporaryPassword: password };
}

export async function addGrant(personId: string, raw: unknown): Promise<PeopleResult> {
  const parsed = z.object({ personId: z.uuid(), grant: grantSchema }).safeParse({ personId, grant: raw });
  if (!parsed.success) return { ok: false, error: "Pick a role and where it applies." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const grant = toGrant(parsed.data.grant);
  if (!canManageGrant(ctx.user.realGrants, grant, ctx.brandWorkspace)) return { ok: false, error: "You can't grant that role." };
  const { error } = await ctx.supabase.from("memberships").insert({ user_id: parsed.data.personId, ...grant, created_by: ctx.user.id });
  if (error) return { ok: false, error: error.code === "23505" ? "They already hold that." : error.message };
  revalidatePath("/ops/users");
  return { ok: true };
}

export async function removeGrant(membershipId: string): Promise<PeopleResult> {
  if (!z.uuid().safeParse(membershipId).success) return { ok: false, error: "Reload and try again." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const { data, error } = await ctx.supabase.from("memberships").delete().eq("id", membershipId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You can't remove that grant." };
  revalidatePath("/ops/users");
  return { ok: true };
}

export async function setPersonActive(personId: string, active: boolean): Promise<PeopleResult> {
  if (!z.uuid().safeParse(personId).success) return { ok: false, error: "Reload and try again." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const grants = await personGrants(ctx.supabase, personId);
  if (!canManagePerson(ctx.user.realGrants, ctx.user.id, personId, grants, ctx.brandWorkspace)) return { ok: false, error: "You can't change that person." };
  const { data: prof } = await ctx.supabase.from("profiles").select("display_name").eq("id", personId).maybeSingle();
  if (!prof) return { ok: false, error: "Person not found." };
  const { error } = await ctx.supabase.rpc("admin_update_profile", { p_user: personId, p_display_name: prof.display_name, p_is_active: active });
  if (error) return { ok: false, error: error.message };
  // Deactivating also shuts the door at Auth: a banned account can't refresh its session.
  await createAdminClient().auth.admin.updateUserById(personId, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/ops/users");
  return { ok: true };
}

export async function resetPassword(personId: string): Promise<PeopleResult> {
  if (!z.uuid().safeParse(personId).success) return { ok: false, error: "Reload and try again." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const grants = await personGrants(ctx.supabase, personId);
  if (!canManagePerson(ctx.user.realGrants, ctx.user.id, personId, grants, ctx.brandWorkspace)) return { ok: false, error: "You can't change that person." };
  const password = temporaryPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(personId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, temporaryPassword: password };
}

export async function renamePerson(personId: string, displayName: string): Promise<PeopleResult> {
  const parsed = z.object({ personId: z.uuid(), displayName: z.string().trim().min(1, "Enter a name.").max(120) }).safeParse({ personId, displayName });
  if (!parsed.success) return { ok: false, error: "Enter a name." };
  const ctx = await context();
  if (!ctx.ok) return ctx;
  const grants = await personGrants(ctx.supabase, personId);
  if (!canManagePerson(ctx.user.realGrants, ctx.user.id, personId, grants, ctx.brandWorkspace)) return { ok: false, error: "You can't change that person." };
  const { data: prof } = await ctx.supabase.from("profiles").select("is_active").eq("id", personId).maybeSingle();
  if (!prof) return { ok: false, error: "Person not found." };
  const { error } = await ctx.supabase.rpc("admin_update_profile", { p_user: personId, p_display_name: parsed.data.displayName, p_is_active: prof.is_active });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ops/users");
  return { ok: true };
}
