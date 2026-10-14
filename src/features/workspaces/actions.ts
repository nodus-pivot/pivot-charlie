"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WORKSPACE_COOKIE } from "./queries";
import { getCurrentUser } from "@/features/auth/queries";
import { canAdministerWorkspace } from "@/features/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { countryField } from "@/features/intake/schema";
import { postSlack } from "@/lib/slack";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the workspace the person is working in. Called directly from the switcher. */
export async function switchWorkspace(raw: { workspaceId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.uuid().safeParse(raw.workspaceId);
  if (!parsed.success) return { ok: false, error: "Unknown workspace." };
  (await cookies()).set(WORKSPACE_COOKIE, parsed.data, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------------------------------------------------------------- workspace settings */

export type WsResult = { ok: true } | { ok: false; error: string };

const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(200)).transform((v) => v || null);

const addressInput = z.object({
  name: optional,
  line1: optional,
  line2: optional,
  city: optional,
  state: optional,
  postal_code: optional,
  country: countryField,
});
export type AddressFields = { name: string; line1: string; line2: string; city: string; state: string; postal_code: string; country: string };

const workspaceInput = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1, "Enter a name.").max(120),
  ticketPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "Prefix: 1–6 letters or digits."),
  bench: addressInput,
  fulfillment: addressInput,
});

async function adminContext(workspaceId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "You're signed out." };
  if (user.viewingAs) return { ok: false as const, error: "Exit the preview to change settings." };
  if (!canAdministerWorkspace(user.grants, workspaceId)) return { ok: false as const, error: "Only owners and admins change workspace settings." };
  return { ok: true as const, user, supabase: await createClient() };
}

const blank = (a: z.infer<typeof addressInput>) => !Object.entries(a).some(([k, v]) => k !== "country" && v);

/** Name, ticket prefix (new tickets only) and the two addresses. */
export async function updateWorkspace(raw: unknown): Promise<WsResult> {
  const parsed = workspaceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  const ctx = await adminContext(d.workspaceId);
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase
    .from("workspaces")
    .update({ name: d.name, ticket_prefix: d.ticketPrefix, bench_address: blank(d.bench) ? null : d.bench, fulfillment_address: blank(d.fulfillment) ? null : d.fulfillment })
    .eq("id", d.workspaceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------------------------------------------------------------- brands */

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "brand";
}

export async function createBrand(workspaceId: string, name: string): Promise<WsResult> {
  const parsed = z.object({ workspaceId: z.uuid(), name: z.string().trim().min(1, "Enter a name.").max(120) }).safeParse({ workspaceId, name });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a name." };
  const ctx = await adminContext(parsed.data.workspaceId);
  if (!ctx.ok) return ctx;
  const base = slugify(parsed.data.name);
  let slug = base;
  for (let n = 2; n < 20; n++) {
    const { data } = await ctx.supabase.from("brands").select("id").eq("workspace_id", parsed.data.workspaceId).eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${n}`;
  }
  const { error } = await ctx.supabase.from("brands").insert({ workspace_id: parsed.data.workspaceId, name: parsed.data.name, slug });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function renameBrand(brandId: string, name: string): Promise<WsResult> {
  const parsed = z.object({ brandId: z.uuid(), name: z.string().trim().min(1, "Enter a name.").max(120) }).safeParse({ brandId, name });
  if (!parsed.success) return { ok: false, error: "Enter a name." };
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("workspace_id").eq("id", parsed.data.brandId).maybeSingle();
  if (!brand) return { ok: false, error: "Brand not found." };
  const ctx = await adminContext(brand.workspace_id);
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.from("brands").update({ name: parsed.data.name }).eq("id", parsed.data.brandId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setBrandActive(brandId: string, active: boolean): Promise<WsResult> {
  if (!z.uuid().safeParse(brandId).success) return { ok: false, error: "Reload and try again." };
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("workspace_id").eq("id", brandId).maybeSingle();
  if (!brand) return { ok: false, error: "Brand not found." };
  const ctx = await adminContext(brand.workspace_id);
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.from("brands").update({ is_active: active }).eq("id", brandId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------------------------------------------------------------- integrations */

/** Posts a hello to the configured Slack channel so an admin can confirm the wiring. */
export async function sendSlackTest(workspaceId: string): Promise<WsResult> {
  if (!z.uuid().safeParse(workspaceId).success) return { ok: false, error: "Reload and try again." };
  const ctx = await adminContext(workspaceId);
  if (!ctx.ok) return ctx;
  const r = await postSlack(`:wave: Pivot test from ${ctx.user.profile.display_name}. If you can read this, Pivot can post here.`);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
