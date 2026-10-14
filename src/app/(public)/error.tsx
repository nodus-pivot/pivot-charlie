"use client";

import { PublicNav } from "@/components/layout/public-nav";
import { ErrorPanel } from "@/components/layout/error-panel";

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNav />
      <ErrorPanel error={error} reset={reset} homeHref="/" homeLabel="Back to the start" />
    </div>
  );
}
