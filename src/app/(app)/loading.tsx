import { BandSkeleton, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Shown while a Service Center or Account page renders: tab strip, band, rows. */
export default function AppLoading() {
  return (
    <>
      <div className="flex h-[42px] flex-none items-center gap-7 border-b border-rule bg-panel px-4 sm:px-8 lg:px-12">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-12" />
      </div>
      <BandSkeleton />
      <RowsSkeleton />
    </>
  );
}
