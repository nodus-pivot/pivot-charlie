// Uploads the demo photos in supabase/seed-photos to the private bucket and
// points the seed rows at them. Run after `npm run db:seed`:
//   node --env-file=.env.local scripts/seed-photos.mjs
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const uid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WATCHES = [{ id: uid(103), file: "watch-103.jpg" }];
const PARTS = [{ sku: "CL-NW-01", file: "part-CL-NW-01.jpg" }, { sku: "BR-TT-01", file: "part-BR-TT-01.jpg" }];

async function put(path, file) {
  const body = await readFile(new URL(`../supabase/seed-photos/${file}`, import.meta.url));
  const { error } = await supabase.storage.from("photos").upload(path, body, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`${path}: ${error.message}`);
}

for (const w of WATCHES) {
  const path = `watches/${w.id}/seed.jpg`;
  await put(path, w.file);
  const { error } = await supabase.from("watches").update({ photo_path: path }).eq("id", w.id);
  if (error) throw error;
  console.log("watch", w.id, path);
}
for (const p of PARTS) {
  const { data: part, error: e1 } = await supabase.from("parts").select("id").eq("sku", p.sku).maybeSingle();
  if (e1 || !part) throw new Error(`part ${p.sku} not found`);
  const path = `parts/${part.id}/seed.jpg`;
  await put(path, p.file);
  const { error } = await supabase.from("parts").update({ photo_path: path }).eq("id", part.id);
  if (error) throw error;
  console.log("part", p.sku, path);
}
