import type { Metadata } from "next";
import { PageBand } from "@/components/layout/page-band";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/features/auth/queries";
import { getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "My bench" };

/** S1 arrives next round; this is the band and an empty body so the shell can be seen. */
export default async function ServiceCenterPage() {
  const [user, ws] = await Promise.all([getCurrentUser(), getWorkspaceContext()]);
  const first = user?.profile.display_name.split(/\s+/)[0] ?? "";

  return (
    <>
      <PageBand
        eyebrow={[ws.current?.name, first].filter(Boolean).join(" · ")}
        title="My bench"
        action={
          <ButtonLink href="/service-center/tickets/new" variant="primary">
            New ticket
          </ButtonLink>
        }
      />
      <section className="px-4 py-7 sm:px-8 lg:px-12">
        <p className="text-sm text-ink-3">The bench list is the next screen to be built.</p>
      </section>
    </>
  );
}
