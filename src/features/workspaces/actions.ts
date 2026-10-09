"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WORKSPACE_COOKIE } from "./queries";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the workspace the person is working in. Called directly from the switcher. */
export async function switchWorkspace(raw: { workspaceId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.uuid().safeParse(raw.workspaceId);
  if (!parsed.success) return { ok: false, error: "Unknown workspace." };
  (await cookies()).set(WORKSPACE_COOKIE, parsed.data, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}
