"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/queries";
import { canIntake } from "@/features/auth/permissions";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";
import { createClient } from "@/lib/supabase/server";
import { moveIncomingRow } from "./moves";
import { forgetIncoming, listIncoming } from "./queries";
import { INCOMING_TAB } from "./sheet";
import { ticketInput } from "./schema";

export type IntakeResult = { ok: true; number: string; moveError?: string } | { ok: false; error: string };

// Input shapes live in schema.ts: a "use server" file may export only async functions.


async function intakeContext() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "You're signed out." };
  const ws = await getWorkspaceContext();
  if (!ws.current) return { ok: false as const, error: "No workspace." };
  const brands = await getVisibleBrands();
  const brandWorkspace = (id: string) => brands.find((b) => b.id === id)?.workspace_id;
  if (!canIntake(user.grants, ws.current.id, brandWorkspace)) return { ok: false as const, error: "Your role can't create tickets here." };
  return { ok: true as const, user, workspace: ws.current, brands, supabase: await createClient() };
}

/**
 * Create a ticket from an Incoming row (or by hand when `sheet` is null).
 * Database first, in one transaction; then the sheet move. A failed move
 * leaves the ledger row with moved_at null, and the page offers Retry.
 */
export async function createTicket(raw: unknown): Promise<IntakeResult> {
  const parsed = ticketInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;
  const ctx = await intakeContext();
  if (!ctx.ok) return ctx;
  if (!ctx.brands.some((b) => b.id === input.brandId && b.workspace_id === ctx.workspace.id)) return { ok: false, error: "Unknown brand." };

  const hasAddress = Object.values(input.shipTo).some(Boolean);
  const { data, error } = await ctx.supabase.rpc("create_ticket", {
    p: {
      workspace_id: ctx.workspace.id,
      brand_id: input.brandId,
      watch_id: input.watchId,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      ship_to: hasAddress ? input.shipTo : null,
      customer_model_text: input.modelText,
      serial: input.serial,
      issue: input.issue,
      bench_note: input.benchNote,
      coverage: input.coverage,
      priority: input.priority,
      needs_payment: input.needsPayment,
      payment_amount: input.paymentAmount,
      return_to_everett: input.returnToEverett,
      on_bench: input.onBench,
      claim_ref: input.claimRef,
      sheet_row: input.sheet ? { fingerprint: input.sheet.fingerprint, source_tab: INCOMING_TAB, raw: input.sheet.raw } : null,
    },
  });
  if (error) return { ok: false, error: error.message.replace(/^.*?: /, "") };
  const number = data?.[0]?.number;
  if (!number) return { ok: false, error: "The ticket was not created." };

  let moveError: string | undefined;
  if (input.sheet) {
    const moved = await moveIncomingRow(input.sheet.fingerprint, "month");
    if (moved.ok) {
      await ctx.supabase.from("sheet_rows").update({ moved_to_tab: moved.tab, moved_at: new Date().toISOString() }).eq("fingerprint", input.sheet.fingerprint);
    } else {
      moveError = moved.error;
    }
  }
  revalidatePath("/service-center", "layout");
  return { ok: true, number, moveError };
}

const dismissInput = z.object({
  fingerprint: z.string().min(8),
  raw: z.record(z.string(), z.string()),
  reason: z.string().trim().min(3, "Give a reason.").max(500),
});

/** Record the dismissal, then move the row to Archive. */
export async function dismissRow(raw: unknown): Promise<{ ok: true; moveError?: string } | { ok: false; error: string }> {
  const parsed = dismissInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ctx = await intakeContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase.from("sheet_rows").insert({
    workspace_id: ctx.workspace.id,
    fingerprint: parsed.data.fingerprint,
    source_tab: INCOMING_TAB,
    raw: parsed.data.raw,
    status: "dismissed",
    reason: parsed.data.reason,
    acted_by: ctx.user.id,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "That row was already handled." : error.message };

  const moved = await moveIncomingRow(parsed.data.fingerprint, "archive");
  let moveError: string | undefined;
  if (moved.ok) {
    await ctx.supabase.from("sheet_rows").update({ moved_to_tab: moved.tab, moved_at: new Date().toISOString() }).eq("fingerprint", parsed.data.fingerprint);
  } else {
    moveError = moved.error;
  }
  revalidatePath("/service-center", "layout");
  return { ok: true, moveError };
}

/** Finish every sheet move the ledger shows as incomplete. */
export async function retryMoves(): Promise<{ ok: true; finished: number; failed: string[] } | { ok: false; error: string }> {
  const ctx = await intakeContext();
  if (!ctx.ok) return ctx;
  const brandId = ctx.brands.find((b) => b.workspace_id === ctx.workspace.id)?.id ?? "";
  const q = await listIncoming(ctx.workspace.id, brandId, { force: true });
  let finished = 0;
  const failed: string[] = [];
  for (const p of q.pendingMoves) {
    const moved = await moveIncomingRow(p.fingerprint, p.status === "imported" ? "month" : "archive");
    if (moved.ok) {
      await ctx.supabase.from("sheet_rows").update({ moved_to_tab: moved.tab, moved_at: new Date().toISOString() }).eq("id", p.id);
      finished++;
    } else {
      failed.push(`${p.name}: ${moved.error}`);
    }
  }
  revalidatePath("/service-center", "layout");
  return { ok: true, finished, failed };
}

/** Re-read the sheet now. */
export async function refreshIncoming(): Promise<void> {
  forgetIncoming();
  revalidatePath("/service-center", "layout");
}
