import { BandSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

/** Under the Ops tab strip, which the layout keeps on screen. */
export default function OpsLoading() {
  return (
    <>
      <BandSkeleton />
      <RowsSkeleton rows={6} />
    </>
  );
}
