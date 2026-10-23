import { Package, PauseCircle } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { daysBetween, formatDate } from "@/lib/format";
import type { Parked } from "../summary";

/**
 * The strip under the hero while a ticket is parked. Amber for waiting on
 * parts, coral for cannot replicate; the right edge says since when.
 */
export function ParkedBanner({ parked }: { parked: Parked }) {
  const waiting = parked.kind === "waiting_for_parts";
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-3 border-y px-4 py-[11px] text-[14px] sm:px-8 lg:px-12",
        waiting ? "border-[#5a4718] bg-amber/8 text-amber" : "border-[#5a2e29] bg-coral/8 text-coral",
      )}
    >
      {waiting ? <Package size={18} className="shrink-0" aria-hidden /> : <PauseCircle size={18} className="shrink-0" aria-hidden />}
      <span>
        <b className="font-medium">{waiting ? "Waiting for parts." : "Parked."}</b>{" "}
        {waiting ? "Requested on Slack. Tick “Parts received” when everything is on your bench." : "Could not replicate the reported issue. Nodus customer service is following up with the customer on Slack."}
      </span>
      {parked.since ? <span className="ml-auto text-[13px] text-ink-2">since {formatDate(parked.since)} · {daysBetween(parked.since)}d</span> : null}
    </p>
  );
}
