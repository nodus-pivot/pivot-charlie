import type { Metadata } from "next";
import { PageBand } from "@/components/layout/page-band";
import { getCurrentUser } from "@/features/auth/queries";
import { getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "Ops" };

/** O1 arrives in its own round; this is the band only so the nav has somewhere to go. */
export default async function OpsPage() {
  const [user, ws] = await Promise.all([getCurrentUser(), getWorkspaceContext()]);
  const first = user?.profile.display_name.split(/\s+/)[0] ?? "";
  return (
    <>
      <PageBand eyebrow={[ws.current?.name, first].filter(Boolean).join(" · ")} title="Watches" />
      <section className="px-4 py-7 sm:px-8 lg:px-12">
        <p className="text-sm text-ink-3">Watches, Components, Users and Workspace are later rounds.</p>
      </section>
    </>
  );
}
