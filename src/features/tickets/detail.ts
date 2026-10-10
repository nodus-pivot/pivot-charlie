import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Address } from "@/lib/address";

type Tables = Database["public"]["Tables"];
export type TicketRow = Tables["tickets"]["Row"];
export type FindingRow = Tables["ticket_findings"]["Row"] & { part: { id: string; name: string; sku: string } | null };
export type PartRow = Tables["ticket_parts"]["Row"] & { part: { id: string; name: string; sku: string; component: string } };
export type TestRow = Tables["ticket_tests"]["Row"];
export type ShipmentRow = Tables["shipments"]["Row"];
export type PhotoRow = Tables["ticket_photos"]["Row"];
export type EventRow = Tables["ticket_events"]["Row"] & { actor_name: string | null };

export type TicketDetail = {
  ticket: TicketRow & { ship_to: Address | null };
  watch: { id: string; name: string; warranty_months: number | null };
  findings: FindingRow[];
  parts: PartRow[];
  tests: TestRow[];
  shipment: ShipmentRow | null;
  photos: PhotoRow[];
  events: EventRow[];
  sheetRow: { moved_to_tab: string | null; moved_at: string | null } | null;
  catalog: { id: string; name: string; warranty_months: number | null }[];
  /** Catalog parts that fit this watch, for the Replace picker. */
  fits: FitPart[];
};

export type FitPart = { id: string; name: string; sku: string; component: Database["public"]["Enums"]["component"]; variant: string | null };

/** Everything a ticket page needs, in one round trip per table. RLS decides visibility; null means not found or not yours. */
export const getTicketDetail = cache(async (number: string): Promise<TicketDetail | null> => {
  const supabase = await createClient();
  const { data: ticket } = await supabase.from("tickets").select("*").eq("number", number).maybeSingle();
  if (!ticket) return null;

  const [watch, findings, parts, tests, shipment, photos, events, sheetRow, catalog, fits] = await Promise.all([
    supabase.from("watches").select("id, name, warranty_months").eq("id", ticket.watch_id).single(),
    supabase.from("ticket_findings").select("*, part:parts(id, name, sku)").eq("ticket_id", ticket.id).order("created_at"),
    supabase.from("ticket_parts").select("*, part:parts(id, name, sku, component)").eq("ticket_id", ticket.id).order("created_at"),
    supabase.from("ticket_tests").select("*").eq("ticket_id", ticket.id).order("created_at"),
    supabase.from("shipments").select("*").eq("ticket_id", ticket.id).maybeSingle(),
    supabase.from("ticket_photos").select("*").eq("ticket_id", ticket.id).order("sort"),
    supabase.from("ticket_events").select("*").eq("ticket_id", ticket.id).order("created_at"),
    ticket.sheet_row_id ? supabase.from("sheet_rows").select("moved_to_tab, moved_at").eq("id", ticket.sheet_row_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("watches").select("id, name, warranty_months").eq("brand_id", ticket.brand_id).eq("is_active", true).order("name"),
    supabase.from("watch_parts").select("part:parts(id, name, sku, component, variant, is_active)").eq("watch_id", ticket.watch_id),
  ]);

  const actorIds = [...new Set((events.data ?? []).map((e) => e.actor_id).filter((x): x is string => !!x))];
  const { data: people } = actorIds.length ? await supabase.from("profiles").select("id, display_name").in("id", actorIds) : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name]));

  return {
    ticket: { ...ticket, ship_to: (ticket.ship_to as Address | null) ?? null },
    watch: watch.data ?? { id: ticket.watch_id, name: "Unknown model", warranty_months: null },
    findings: (findings.data ?? []) as FindingRow[],
    parts: (parts.data ?? []) as PartRow[],
    tests: tests.data ?? [],
    shipment: shipment.data ?? null,
    photos: photos.data ?? [],
    events: (events.data ?? []).map((e) => ({ ...e, actor_name: e.actor_id ? (nameOf.get(e.actor_id) ?? null) : null })),
    sheetRow: sheetRow.data ?? null,
    catalog: catalog.data ?? [],
    fits: (fits.data ?? [])
      .map((r) => r.part as unknown as FitPart & { is_active: boolean })
      .filter((p) => p && p.is_active)
      .map(({ id, name, sku, component, variant }) => ({ id, name, sku, component, variant }))
      .sort((a, b) => a.component.localeCompare(b.component) || a.name.localeCompare(b.name)),
  };
});
