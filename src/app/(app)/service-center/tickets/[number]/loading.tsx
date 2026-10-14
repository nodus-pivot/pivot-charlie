import { BandSkeleton, Skeleton } from "@/components/ui/skeleton";

/** The ticket page's shape: band, dossier column, step rail. */
export default function TicketLoading() {
  return (
    <>
      <BandSkeleton />
      <div className="flex flex-1 flex-col lg:flex-row" role="status" aria-label="Loading ticket">
        <aside className="flex w-full flex-none flex-col gap-6 border-b border-rule px-4 pb-8 pt-8 sm:px-8 lg:w-[380px] lg:border-b-0 lg:border-r lg:pl-12 lg:pr-9">
          <Skeleton className="h-2.5 w-24" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 border-t border-rule pt-3.5">
              <Skeleton className="h-2 w-16" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-8 px-4 pb-10 pt-8 sm:px-8 lg:pl-[52px] lg:pr-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-rule pb-5">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
