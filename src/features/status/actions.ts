"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { PublicStatus } from "./public";
import { countryField } from "@/features/intake/schema";

/**
 * Public lookups. The anonymous Supabase client calls the two definer
 * functions; nothing here reads tables directly. Both need the number and
 * the email, and a miss returns the same message either way.
 */

const lookupInput = z.object({
  number: z.string().trim().min(4, "Enter your ticket number.").max(20),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter the email you used.")),
});

export type LookupState = { status?: PublicStatus; error?: string; number?: string; email?: string };

const NOT_FOUND = "No repair matches that ticket number and email. Check your confirmation email and try again.";

export async function lookupRepair(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const number = String(formData.get("number") ?? "");
  const email = String(formData.get("email") ?? "");
  const parsed = lookupInput.safeParse({ number, email });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? NOT_FOUND, number, email };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_ticket_status", { p_number: parsed.data.number, p_email: parsed.data.email });
  if (error || !data) return { error: NOT_FOUND, number, email };
  return { status: data as unknown as PublicStatus, number: parsed.data.number, email: parsed.data.email };
}

const addressInput = z.object({
  number: z.string().trim().min(4).max(20),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  line1: z.string().trim().min(1, "Enter the street.").max(200),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(1, "Enter the city.").max(100),
  state: z.string().trim().max(50).optional().default(""),
  postal_code: z.string().trim().max(20).optional().default(""),
  country: countryField,
});

export type AddressRequestState = { ok?: boolean; error?: string };

export async function requestAddressChange(_prev: AddressRequestState, formData: FormData): Promise<AddressRequestState> {
  const parsed = addressInput.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the address." };
  const { number, email, ...address } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_request_address_update", { p_number: number, p_email: email, p_address: address });
  if (error || !data) return { error: "We couldn't record that. If the repair has already shipped, reply to your shipping email instead." };
  return { ok: true };
}
