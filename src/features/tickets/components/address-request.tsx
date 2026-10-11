"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { addressInline, type Address } from "@/lib/address";
import { resolveAddressRequest } from "../actions";

/** The amber strip under the band: the customer asked for a new return address from Check a repair. */
export function AddressRequest({ number, eventId, address, canAct }: { number: string; eventId: string; address: Address; canAct: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (accept: boolean) => start(async () => { const r = await resolveAddressRequest(number, eventId, accept); if (r.ok) router.refresh(); });
  return (
    <p className="flex flex-wrap items-center gap-3 border-b border-amber/40 bg-amber/10 px-4 py-2 text-[13px] text-amber sm:px-8 lg:px-12">
      The customer asked to ship to <span className="text-ink">{addressInline(address)}</span> instead. Confirm it with them at the email on file before using it.
      {canAct ? (
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(false)}>Keep current</Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => act(true)}>Use it</Button>
        </span>
      ) : null}
    </p>
  );
}
