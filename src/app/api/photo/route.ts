import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams one object from the private photos bucket as the signed-in person.
 * Storage RLS (app.photo_path_allowed) decides; anything refused is a 404.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("p") ?? "";
  if (!/^(tickets|watches|parts)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(path)) return new NextResponse(null, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("photos").download(path);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(data, {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
