// Uploads the demo photos in supabase/seed-photos to the private bucket at the
// paths the seed's ticket_photos rows point to. Run after `npm run db:seed`
// or a `supabase db reset --linked`:
//   node --env-file=.env.local scripts/seed-photos.mjs
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const uid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ticket id (seed.py: 4000 + n) → file. Keep in step with the `photos` entries in seed.py.
const PHOTOS = [
  { ticket: uid(4003), file: "watch-103.jpg" },      // James Whitfield · customer photo
  { ticket: uid(4007), file: "part-CL-NW-01.jpg" },  // Tom Reyes · bench photo
];

for (const p of PHOTOS) {
  const path = `tickets/${p.ticket}/seed.jpg`;
  const body = await readFile(new URL(`../supabase/seed-photos/${p.file}`, import.meta.url));
  const { error } = await supabase.storage.from("photos").upload(path, body, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`${path}: ${error.message}`);
  console.log("uploaded", path);
}
