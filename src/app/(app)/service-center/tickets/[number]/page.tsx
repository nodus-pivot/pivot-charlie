import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { STAGE_LABELS, canActOn } from "@/features/pipeline";
import { getTicketDetail } from "@/features/tickets/detail";
import { CheckInStep } from "@/features/tickets/components/check-in-step";
import { TicketFrame } from "@/features/tickets/components/ticket-frame";
import { getWorkspaceContext } from "@/features/workspaces/queries";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/service-center/tickets/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: number };
}

/** The ticket page. The frame is shared; what renders under the open step depends on the stage. */
export default async function TicketPage({ params, searchParams }: PageProps<"/service-center/tickets/[number]">) {
  const [{ number }, sp, user, ws] = await Promise.all([params, searchParams, getCurrentUser(), getWorkspaceContext()]);
  if (!user) redirect(SIGN_IN_PATH);
  const detail = await getTicketDetail(number);
  if (!detail) notFound();
  const t = detail.ticket;
  const canAct = canActOn(user.grants, t.stage, t.workspace_id, t.brand_id);

  let step: React.ReactNode;
  if (t.stage === "check_in") {
    const sourceLine = `${t.source === "sheet" ? "From the website" : "By hand"} · ${formatDate(t.created_at)}`;
    step = (
      <CheckInStep
        number={t.number}
        sourceLine={sourceLine}
        received={!!t.received_at}
        priority={t.priority}
        needsPayment={t.needs_payment}
        returnToEverett={t.return_to_everett}
        canAct={canAct}
      />
    );
  } else if (t.stage === "closed") {
    step = null;
  } else {
    step = <p className="text-sm text-ink-3">The {STAGE_LABELS[t.stage]} step is built in a later round.</p>;
  }

  return (
    <TicketFrame detail={detail} user={user} workspaceName={ws.current?.name ?? "Pivot"} moveFailed={sp.move === "failed"}>
      {step}
    </TicketFrame>
  );
}
