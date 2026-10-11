import "server-only";
import { createClient } from "@/lib/supabase/server";
import { COMPONENTS, type Component } from "@/features/pipeline";

export type WatchListRow = {
  id: string;
  name: string;
  reference: string | null;
  warranty_months: number | null;
  movement: string | null;
  case_spec: string | null;
  is_active: boolean;
  fits: number;
};

/** Every model of the brand with how many catalog parts fit it. */
export async function listWatches(brandId: string): Promise<WatchListRow[]> {
  const supabase = await createClient();
  const [{ data: watches, error }, { data: fits }] = await Promise.all([
    supabase.from("watches").select("id, name, reference, warranty_months, movement, case_spec, is_active").eq("brand_id", brandId).order("name"),
    supabase.from("watch_parts").select("watch_id"),
  ]);
  if (error) throw error;
  const count = new Map<string, number>();
  for (const f of fits ?? []) count.set(f.watch_id, (count.get(f.watch_id) ?? 0) + 1);
  return (watches ?? []).map((w) => ({ ...w, fits: count.get(w.id) ?? 0 }));
}

export type CatalogPart = { id: string; name: string; sku: string; variant: string | null; component: Component; is_active: boolean };

export type WatchDetail = {
  watch: { id: string; brand_id: string; name: string; reference: string | null; warranty_months: number | null; movement: string | null; case_spec: string | null; notes: string | null; is_active: boolean };
  /** Every active part of the brand, grouped by component in chip order, with whether it fits this watch. */
  groups: { component: Component; parts: (CatalogPart & { fits: boolean })[] }[];
};

export async function getWatch(id: string): Promise<WatchDetail | null> {
  const supabase = await createClient();
  const { data: watch } = await supabase.from("watches").select("id, brand_id, name, reference, warranty_months, movement, case_spec, notes, is_active").eq("id", id).maybeSingle();
  if (!watch) return null;
  const [{ data: parts }, { data: fits }] = await Promise.all([
    supabase.from("parts").select("id, name, sku, variant, component, is_active").eq("brand_id", watch.brand_id).eq("is_active", true).order("name"),
    supabase.from("watch_parts").select("part_id").eq("watch_id", id),
  ]);
  const fitSet = new Set((fits ?? []).map((f) => f.part_id));
  const groups = COMPONENTS.map((component) => ({
    component,
    parts: (parts ?? []).filter((p) => p.component === component).map((p) => ({ ...p, fits: fitSet.has(p.id) })),
  })).filter((g) => g.parts.length > 0);
  return { watch, groups };
}
