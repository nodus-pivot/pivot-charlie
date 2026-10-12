"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddPhotoSlot, Lightbox, PhotoThumb } from "@/components/ui/photo";
import { uploadPhoto } from "@/lib/photos-client";
import { addTicketPhoto, removeTicketPhoto } from "../actions";

type Photo = { id: string; path: string };

/** Thumbnails for one kind of ticket photo, with add and remove for anyone in scope. */
export function PhotoStrip({ number, kind, photos, canEdit }: { number: string; kind: "customer" | "bench"; photos: Photo[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = kind === "customer" ? "customer photo" : "bench photo";

  async function add(files: File[]) {
    setError(null);
    setUploading((n) => n + files.length);
    const { data: ticketId } = await ticketIdFor(number);
    for (const file of files) {
      try {
        if (!ticketId) throw new Error("Ticket not found.");
        const path = await uploadPhoto("tickets", ticketId, file);
        const r = await addTicketPhoto(number, { path, kind });
        if (!r.ok) throw new Error(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That photo didn't upload.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    setRemoving(id);
    const r = await removeTicketPhoto(number, id);
    setRemoving(null);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  if (!canEdit && photos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {photos.map((p, i) => (
          <PhotoThumb key={p.id} path={p.path} alt={`${label} ${i + 1}`} onOpen={() => setOpen(p.path)} onRemove={canEdit ? () => remove(p.id) : undefined} busy={removing === p.id} />
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <span key={`u${i}`} className="size-14 animate-pulse rounded-xs border border-rule bg-panel" aria-label="Uploading" />
        ))}
        {canEdit ? <AddPhotoSlot onFiles={add} multiple label={`Add ${label}`} /> : null}
      </div>
      {error ? <span role="alert" className="text-xs text-coral">{error}</span> : null}
      <Lightbox path={open} alt={label} onClose={() => setOpen(null)} />
    </div>
  );
}

/** The storage folder is the ticket id, which the dossier doesn't carry; one light lookup. */
async function ticketIdFor(number: string): Promise<{ data: string | null }> {
  const { createClient } = await import("@/lib/supabase/client");
  const { data } = await createClient().from("tickets").select("id").eq("number", number).maybeSingle();
  return { data: data?.id ?? null };
}
