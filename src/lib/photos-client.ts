"use client";

import { createClient } from "@/lib/supabase/client";
import { newPhotoPath, preparePhoto, type PhotoFolder } from "./photos";

/** Resize, then put the file in Storage under the folder. Returns the stored path. RLS refuses paths the person may not write. */
export async function uploadPhoto(folder: PhotoFolder, id: string, file: File): Promise<string> {
  const { blob, ext, contentType } = await preparePhoto(file);
  const path = newPhotoPath(folder, id, ext);
  const supabase = createClient();
  const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType, upsert: false, cacheControl: "3600" });
  if (error) throw new Error(error.message.includes("row-level security") ? "You can't add photos here." : error.message);
  return path;
}
