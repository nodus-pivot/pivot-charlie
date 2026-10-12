"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, X } from "@phosphor-icons/react";
import { photoUrl } from "@/lib/photos";
import { cn } from "@/lib/utils";

/** Plain img for Storage photos: the route is same-origin and already sized, so next/image adds nothing. */
export function Img({ path, alt, className }: { path: string; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={photoUrl(path)} alt={alt} className={className} loading="lazy" decoding="async" />;
}

/** A hidden file input behind whatever button you render. Camera on phones, picker on desktop. */
export function PhotoPicker({ onFiles, multiple, disabled, children, className, "aria-label": ariaLabel }: { onFiles: (files: File[]) => void; multiple?: boolean; disabled?: boolean; children: ReactNode; className?: string; "aria-label"?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={className} aria-label={ariaLabel}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

/** Dashed square with a camera: the "add a photo" affordance from the mocks. */
export function AddPhotoSlot({ onFiles, multiple, disabled, size = "size-14", label = "Add photo" }: { onFiles: (files: File[]) => void; multiple?: boolean; disabled?: boolean; size?: string; label?: string }) {
  return (
    <PhotoPicker onFiles={onFiles} multiple={multiple} disabled={disabled} aria-label={label} className={cn("grid place-items-center rounded-xs border border-dashed border-border-strong text-ink-3 transition-colors hover:border-gold hover:text-gold-light disabled:opacity-50", size)}>
      <Camera size={18} />
    </PhotoPicker>
  );
}

/** Thumbnail that opens the lightbox; optional remove cross. */
export function PhotoThumb({ path, alt, size = "size-14", onOpen, onRemove, busy }: { path: string; alt: string; size?: string; onOpen: () => void; onRemove?: () => void; busy?: boolean }) {
  return (
    <span className={cn("group relative block shrink-0 overflow-hidden rounded-xs border border-rule bg-panel", size, busy && "opacity-50")}>
      <button type="button" onClick={onOpen} className="block size-full" aria-label={`Open ${alt}`}>
        <Img path={path} alt={alt} className="size-full object-cover" />
      </button>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${alt}`} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-ground/85 text-ink-2 opacity-0 transition-opacity hover:text-coral focus-visible:opacity-100 group-hover:opacity-100">
          <X size={11} />
        </button>
      ) : null}
    </span>
  );
}

/** Full-size view over the page. Escape or a click outside closes it. */
export function Lightbox({ path, alt, onClose }: { path: string | null; alt: string; onClose: () => void }) {
  useEffect(() => {
    if (!path) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [path, onClose]);
  if (!path) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={alt} onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-ground/92 p-6 backdrop-blur-sm">
      <Img path={path} alt={alt} className="max-h-[90vh] max-w-[92vw] rounded-xs border border-rule object-contain shadow-2xl" />
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-5 top-5 grid size-9 place-items-center rounded-full border border-rule bg-panel text-ink-2 hover:text-ink">
        <X size={16} />
      </button>
    </div>
  );
}

/**
 * One photo for a catalog row (a watch, a part): the picture or an empty
 * slot, with Replace and Remove for admins. The parent does the upload and
 * the save; this handles the busy state and the lightbox.
 */
export function PhotoTile({ path, alt, canEdit, onPick, onRemove, className, placeholder }: { path: string | null; alt: string; canEdit: boolean; onPick: (file: File) => Promise<void>; onRemove: () => Promise<void>; className?: string; placeholder: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("relative aspect-square w-full overflow-hidden rounded-xs border border-rule bg-panel", busy && "opacity-60")}>
        {path ? (
          <button type="button" onClick={() => setOpen(true)} className="block size-full" aria-label={`Open photo of ${alt}`}>
            <Img path={path} alt={alt} className="size-full object-cover" />
          </button>
        ) : canEdit ? (
          <PhotoPicker onFiles={(f) => run(() => onPick(f[0]))} disabled={busy} aria-label={`Add a photo of ${alt}`} className="grid size-full place-items-center gap-2 text-ink-3 transition-colors hover:text-gold-light">
            <span className="flex flex-col items-center gap-2"><Camera size={26} /><span className="text-[11px] uppercase tracking-label">Add photo</span></span>
          </PhotoPicker>
        ) : (
          <span className="grid size-full place-items-center text-border-strong">{placeholder}</span>
        )}
      </div>
      {canEdit && path ? (
        <div className="flex items-center gap-3 text-[12px]">
          <PhotoPicker onFiles={(f) => run(() => onPick(f[0]))} disabled={busy} className="text-ink-3 hover:text-gold-light">Replace</PhotoPicker>
          <button type="button" disabled={busy} onClick={() => run(onRemove)} className="text-ink-3 hover:text-coral">Remove</button>
        </div>
      ) : null}
      {error ? <span role="alert" className="text-[12px] text-coral">{error}</span> : null}
      <Lightbox path={open ? path : null} alt={alt} onClose={() => setOpen(false)} />
    </div>
  );
}
