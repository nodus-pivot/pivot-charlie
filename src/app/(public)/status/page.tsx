import type { Metadata } from "next";
import { PublicNav } from "@/components/layout/public-nav";
import { StatusLookup } from "@/features/status/components/status-lookup";

export const metadata: Metadata = { title: "Check a repair" };

/** P2: public, no sign-in. Both the ticket number and the email are required; nothing goes in the URL. */
export default function StatusPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNav showStatusLink={false} />
      <main className="flex min-h-0 flex-1 flex-col">
        <StatusLookup />
      </main>
    </div>
  );
}
