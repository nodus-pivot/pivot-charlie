"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./queries";
import { AFTER_SIGN_IN_PATH, SIGN_IN_PATH } from "./redirect";
import { signInSchema } from "./schema";
import { VIEW_AS_COOKIE, canPreviewAs, serializeViewAs, type ViewAs } from "./view-as";

/** `email` echoes the submitted value so the field survives a failed attempt. */
export type SignInState = { error?: string; email?: string };

const WRONG_CREDENTIALS = "Wrong email or password.";
const DEACTIVATED = "This account has been deactivated.";

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? WRONG_CREDENTIALS, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // Every auth failure gets the same message so the form never confirms whether an email exists.
    return { error: WRONG_CREDENTIALS, email };
  }

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: DEACTIVATED, email };
  }

  redirect(AFTER_SIGN_IN_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect(SIGN_IN_PATH);
}

/* ---------------------------------------------------------------- view as */

const viewAsInput = z.discriminatedUnion("role", [
  z.object({ role: z.literal("admin"), workspaceId: z.uuid() }),
  z.object({ role: z.enum(["brand_rep", "watchmaker"]), brandId: z.uuid() }),
]);

/** Start previewing as a lesser role. The database re-checks the right on every request. */
export async function setViewAs(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = viewAsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick a role and a brand or workspace." };
  const v: ViewAs = parsed.data;
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You're signed out." };
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, workspace_id");
  const brandWorkspace = (id: string) => brands?.find((b) => b.id === id)?.workspace_id;
  if (!canPreviewAs(user.realGrants, v, brandWorkspace)) {
    return { ok: false, error: "You can only preview roles inside workspaces you administer." };
  }
  (await cookies()).set(VIEW_AS_COOKIE, serializeViewAs(v), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 8 });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearViewAs(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
  redirect(AFTER_SIGN_IN_PATH);
}
