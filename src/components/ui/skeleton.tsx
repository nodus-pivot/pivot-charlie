import { cn } from "@/lib/utils";

/** A quiet placeholder block for loading states: rule-coloured, slow pulse. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-xs bg-rule/70", className)} />;
}

/** The 200px band with eyebrow and title placeholders, matching PageBand. */
export function BandSkeleton() {
  return (
    <div className="relative h-[200px] flex-none bg-panel">
      <div className="absolute inset-x-4 bottom-[22px] flex flex-col gap-4 sm:inset-x-8 lg:inset-x-12">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-11 w-64 sm:h-14 sm:w-80" />
      </div>
    </div>
  );
}

/** A handful of list rows under a band. */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col px-4 pt-7 sm:px-8 lg:px-12" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-5 border-t border-rule py-4">
          <Skeleton className="size-[52px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48 max-w-[60%]" />
            <Skeleton className="h-3 w-32 max-w-[40%]" />
          </div>
          <Skeleton className="hidden h-[34px] w-32 lg:block" />
        </div>
      ))}
    </div>
  );
}
