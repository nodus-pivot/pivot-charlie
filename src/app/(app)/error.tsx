"use client";

import { ErrorPanel } from "@/components/layout/error-panel";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} homeHref="/service-center" homeLabel="Back to My bench" />;
}
