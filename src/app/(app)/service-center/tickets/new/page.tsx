import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";
import { PageBand } from "@/components/layout/page-band";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { getCurrentUser } from "@/features/auth/queries";
import { canIntake } from "@/features/auth/permissions";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { NewTicketForm } from "@/features/intake/components/new-ticket";
import { getCatalog } from "@/features/intake/queries";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";

export const metadata: Metadata = { title: "New ticket" };

/** S2: the Incoming review pane without the queue, for walk-ins. */
export default async function NewTicketPage() {
  const [user, ws, brands] = await Promise.all([getCurrentUser(), getWorkspaceContext(), getVisibleBrands()]);
  if (!user) redirect(SIGN_IN_PATH);
  const brand = brands.find((b) => b.workspace_id === ws.current?.id);
  const brandWorkspace = (id: string) => brands.find((b) => b.id === id)?.workspace_id;
  if (!ws.current || !brand || !canIntake(user.grants, ws.current.id, brandWorkspace)) {
    return (
      <section className="px-12 py-9">
        <Eyebrow>New ticket</Eyebrow>
        <p className="mt-4 text-sm text-ink-3">Your role can&rsquo;t create tickets here.</p>
      </section>
    );
  }
  const catalog = await getCatalog(brand.id);
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";

  return (
    <>
      <PageBand
        eyebrow={`${ws.current.name} · ${first}`}
        title="New ticket"
        action={
          <ButtonLink href="/service-center" variant="secondary" size="sm">
            <ArrowLeft size={14} /> My bench
          </ButtonLink>
        }
      />
      <section className="flex flex-col px-4 pb-10 pt-7 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
          <Eyebrow>By hand · for walk-ins</Eyebrow>
          <span className="text-sm text-ink-2">
            Website requests come through{" "}
            <Link href="/service-center/incoming" className="text-gold-light hover:text-gold">
              Incoming
            </Link>
          </span>
        </div>
        <NewTicketForm catalog={catalog} brandId={brand.id} />
      </section>
    </>
  );
}
