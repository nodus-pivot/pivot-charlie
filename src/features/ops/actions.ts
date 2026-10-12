"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/queries";
import { canEditOps } from "@/features/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { COMPONENTS, type Component } from "@/features/pipeline";
import { photoPathBelongsTo } from "@/lib/photos";

export type OpsResult = { ok: true; id?: string } | { ok: false; error: string };

const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(500)).transform((v) => v || null);

const watchInput = z.object({
  brandId: z.uuid(),
  name: z.string().trim().min(1, "Give the model a name.").max(120),
  reference: optional,
  warrantyMonths: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(240).nullable()),
  movement: optional,
  caseSpec: optional,
  notes: optional,
});
export type WatchInput = z.input<typeof watchInput>;

async function adminFor(workspaceId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "You're signed out." };
  if (user.viewingAs) return { ok: false as const, error: "Exit the preview to change the catalog." };
  if (!canEditOps(user.grants, workspaceId)) return { ok: false as const, error: "Only owners and admins edit the catalog." };
  return { ok: true as const, user, supabase: await createClient() };
}

async function workspaceOfBrand(brandId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("workspace_id").eq("id", brandId).maybeSingle();
  return data?.workspace_id ?? null;
}

export async function createWatch(raw: unknown): Promise<OpsResult> {
  const parsed = watchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ws = await workspaceOfBrand(parsed.data.brandId);
  if (!ws) return { ok: false, error: "Unknown brand." };
  const ctx = await adminFor(ws);
  if (!ctx.ok) return ctx;
  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from("watches")
    .insert({ workspace_id: ws, brand_id: d.brandId, name: d.name, reference: d.reference, warranty_months: d.warrantyMonths, movement: d.movement, case_spec: d.caseSpec, notes: d.notes })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "A model with that name already exists." : error.message };
  revalidatePath("/ops", "layout");
  return { ok: true, id: data.id };
}

export async function updateWatch(watchId: string, raw: unknown): Promise<OpsResult> {
  if (!z.uuid().safeParse(watchId).success) return { ok: false, error: "Unknown watch." };
  const parsed = watchInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ws = await workspaceOfBrand(parsed.data.brandId);
  if (!ws) return { ok: false, error: "Unknown brand." };
  const ctx = await adminFor(ws);
  if (!ctx.ok) return ctx;
  const d = parsed.data;
  const { error } = await ctx.supabase
    .from("watches")
    .update({ name: d.name, reference: d.reference, warranty_months: d.warrantyMonths, movement: d.movement, case_spec: d.caseSpec, notes: d.notes })
    .eq("id", watchId);
  if (error) return { ok: false, error: error.code === "23505" ? "A model with that name already exists." : error.message };
  revalidatePath("/ops", "layout");
  return { ok: true };
}

/** Retire hides a model from pickers; tickets that reference it keep working. */
export async function setWatchActive(watchId: string, active: boolean): Promise<OpsResult> {
  if (!z.uuid().safeParse(watchId).success) return { ok: false, error: "Unknown watch." };
  const supabase = await createClient();
  const { data: w } = await supabase.from("watches").select("workspace_id").eq("id", watchId).maybeSingle();
  if (!w) return { ok: false, error: "Unknown watch." };
  const ctx = await adminFor(w.workspace_id);
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.from("watches").update({ is_active: active }).eq("id", watchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ops", "layout");
  return { ok: true };
}

/** Tick or untick: does this catalog part fit this watch? This is the only editor of fits. */
export async function setWatchPart(watchId: string, partId: string, fits: boolean): Promise<OpsResult> {
  if (!z.uuid().safeParse(watchId).success || !z.uuid().safeParse(partId).success) return { ok: false, error: "Unknown row." };
  const supabase = await createClient();
  const { data: w } = await supabase.from("watches").select("workspace_id").eq("id", watchId).maybeSingle();
  if (!w) return { ok: false, error: "Unknown watch." };
  const ctx = await adminFor(w.workspace_id);
  if (!ctx.ok) return ctx;
  const { error } = fits
    ? await ctx.supabase.from("watch_parts").upsert({ watch_id: watchId, part_id: partId }, { onConflict: "watch_id,part_id", ignoreDuplicates: true })
    : await ctx.supabase.from("watch_parts").delete().eq("watch_id", watchId).eq("part_id", partId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ops", "layout");
  return { ok: true };
}

/* ---------------------------------------------------------------- parts */

const partInput = z.object({
  brandId: z.uuid(),
  component: z.enum(COMPONENTS as [Component, ...Component[]]),
  name: z.string().trim().min(1, "Give the part a name.").max(120),
  sku: z.string().trim().min(1, "Give the part a SKU.").max(40).transform((v) => v.toUpperCase()),
  variant: optional,
});
export type PartInput = z.input<typeof partInput>;

export async function createPart(raw: unknown): Promise<OpsResult> {
  const parsed = partInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ws = await workspaceOfBrand(parsed.data.brandId);
  if (!ws) return { ok: false, error: "Unknown brand." };
  const ctx = await adminFor(ws);
  if (!ctx.ok) return ctx;
  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from("parts")
    .insert({ workspace_id: ws, brand_id: d.brandId, component: d.component, name: d.name, sku: d.sku, variant: d.variant })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "That SKU already exists." : error.message };
  revalidatePath("/ops", "layout");
  return { ok: true, id: data.id };
}

export async function updatePart(partId: string, raw: unknown): Promise<OpsResult> {
  if (!z.uuid().safeParse(partId).success) return { ok: false, error: "Unknown part." };
  const parsed = partInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ws = await workspaceOfBrand(parsed.data.brandId);
  if (!ws) return { ok: false, error: "Unknown brand." };
  const ctx = await adminFor(ws);
  if (!ctx.ok) return ctx;
  const d = parsed.data;
  const { error } = await ctx.supabase.from("parts").update({ component: d.component, name: d.name, sku: d.sku, variant: d.variant }).eq("id", partId);
  if (error) return { ok: false, error: error.code === "23505" ? "That SKU already exists." : error.message };
  revalidatePath("/ops", "layout");
  return { ok: true };
}

export async function setPartActive(partId: string, active: boolean): Promise<OpsResult> {
  if (!z.uuid().safeParse(partId).success) return { ok: false, error: "Unknown part." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("parts").select("workspace_id").eq("id", partId).maybeSingle();
  if (!p) return { ok: false, error: "Unknown part." };
  const ctx = await adminFor(p.workspace_id);
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.from("parts").update({ is_active: active }).eq("id", partId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ops", "layout");
  return { ok: true };
}

/* ---------------------------------------------------------------- photos */

const photoPath = z.string().min(1).max(200).nullable();

/** Point the watch at a photo the browser already uploaded under watches/<id>/, or clear it. The old object is removed. */
export async function setWatchPhoto(watchId: string, rawPath: unknown): Promise<OpsResult> {
  const parsed = z.object({ id: z.uuid(), path: photoPath }).safeParse({ id: watchId, path: rawPath });
  if (!parsed.success) return { ok: false, error: "That photo didn't upload." };
  const supabase = await createClient();
  const { data: watch } = await supabase.from("watches").select("workspace_id, photo_path").eq("id", parsed.data.id).maybeSingle();
  if (!watch) return { ok: false, error: "Watch not found." };
  const ctx = await adminFor(watch.workspace_id);
  if (!ctx.ok) return ctx;
  if (parsed.data.path && !photoPathBelongsTo(parsed.data.path, "watches", parsed.data.id)) return { ok: false, error: "That photo belongs to another watch." };
  const { error } = await ctx.supabase.from("watches").update({ photo_path: parsed.data.path }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  if (watch.photo_path && watch.photo_path !== parsed.data.path) await ctx.supabase.storage.from("photos").remove([watch.photo_path]);
  revalidatePath("/ops", "layout");
  return { ok: true };
}

export async function setPartPhoto(partId: string, rawPath: unknown): Promise<OpsResult> {
  const parsed = z.object({ id: z.uuid(), path: photoPath }).safeParse({ id: partId, path: rawPath });
  if (!parsed.success) return { ok: false, error: "That photo didn't upload." };
  const supabase = await createClient();
  const { data: part } = await supabase.from("parts").select("workspace_id, photo_path").eq("id", parsed.data.id).maybeSingle();
  if (!part) return { ok: false, error: "Part not found." };
  const ctx = await adminFor(part.workspace_id);
  if (!ctx.ok) return ctx;
  if (parsed.data.path && !photoPathBelongsTo(parsed.data.path, "parts", parsed.data.id)) return { ok: false, error: "That photo belongs to another part." };
  const { error } = await ctx.supabase.from("parts").update({ photo_path: parsed.data.path }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  if (part.photo_path && part.photo_path !== parsed.data.path) await ctx.supabase.storage.from("photos").remove([part.photo_path]);
  revalidatePath("/ops", "layout");
  return { ok: true };
}
