import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { VIEW_AS_COOKIE, parseViewAs, viewAsHeaders } from "@/features/auth/view-as";
import type { Database } from "./database.types";

/**
 * Supabase client for server components, server actions and route handlers.
 * Runs as the signed-in user; row-level security is the authorization.
 * While previewing as another role, the View-as headers narrow the grants.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const headers = viewAsHeaders(parseViewAs(cookieStore.get(VIEW_AS_COOKIE)?.value));
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component, where cookies are read-only.
            // proxy.ts refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
