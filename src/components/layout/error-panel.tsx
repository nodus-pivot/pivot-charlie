"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

/**
 * What a route shows when rendering throws: a short line in the Atelier
 * voice, Retry (re-renders the segment) and a way back. Production strips
 * the message, so the copy is generic and the digest is the handle for the
 * server log.
 */
export function ErrorPanel({ error, reset, homeHref, homeLabel }: { error: Error & { digest?: string }; reset: () => void; homeHref: string; homeLabel: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-16 sm:px-8 lg:px-12" role="alert">
      <div className="flex max-w-[560px] flex-col gap-6">
        <Eyebrow>Something slipped</Eyebrow>
        <h1 className="font-display text-[40px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[52px]">
          This page didn&rsquo;t load.
        </h1>
        <p className="text-base leading-[1.55] text-ink-2">
          Nothing was changed. Try again in a moment, or go back and come in fresh. If Incoming keeps failing, check that the Google Sheet is still shared with Pivot.
        </p>
        {error.digest ? <p className="font-mono text-xs text-ink-3">ref {error.digest}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={reset}>Try again</Button>
          <ButtonLink href={homeHref}>{homeLabel}</ButtonLink>
        </div>
      </div>
    </main>
  );
}
