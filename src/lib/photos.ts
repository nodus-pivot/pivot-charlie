/**
 * Photos live in the private "photos" bucket under tickets/<id>/. The browser
 * uploads straight to Storage (RLS decides), then a server action records the
 * path. Pages read them back through /api/photo, which streams the object as
 * the signed-in person.
 */

export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type PhotoFolder = "tickets";

export function photoUrl(path: string): string {
  return `/api/photo?p=${encodeURIComponent(path)}`;
}

export function newPhotoPath(folder: PhotoFolder, id: string, ext = "jpg"): string {
  const stamp = Date.now().toString(36);
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${folder}/${id}/${stamp}-${rand}.${ext}`;
}

export function photoPathBelongsTo(path: string, folder: PhotoFolder, id: string): boolean {
  return new RegExp(`^${folder}/${id}/[A-Za-z0-9._-]+$`).test(path);
}

/**
 * Shrink a camera photo to at most 1600px on the long edge as JPEG so phone
 * uploads stay small. Anything the browser cannot decode (HEIC on Chrome) is
 * sent as it came.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; ext: string; contentType: string }> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (file.size > PHOTO_MAX_BYTES) throw new Error("Photos must be under 10 MB.");
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("no blob");
    return { blob, ext: "jpg", contentType: "image/jpeg" };
  } catch {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return { blob: file, ext: ext.replace(/[^a-z0-9]/g, "") || "jpg", contentType: file.type || "image/jpeg" };
  }
}
