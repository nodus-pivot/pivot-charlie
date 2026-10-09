import Link from "next/link";
import { cn } from "@/lib/utils";

/** "○ Pivot": a 12px gold ring and the name in Cormorant, tracked wide. */
export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 font-display text-2xl font-medium tracking-wordmark text-ink", className)}>
      <span aria-hidden className="size-3 rounded-full border-[1.5px] border-gold" />
      Pivot
    </Link>
  );
}
