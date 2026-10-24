import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { STEPS, canActOn, isAdminOf, type Step, type TestKind } from "@/features/pipeline";
import type { Address } from "@/lib/address";
import { getTicketDetail, messageAuthors } from "@/features/tickets/detail";
import { countTickets } from "@/features/tickets/queries";
import { stepOf } from "@/features/tickets/summary";
import { ServiceCenterTabs } from "@/components/layout/service-center-tabs";
import { StepForm } from "@/features/tickets/components/step-form";
import { TicketFrame } from "@/features/tickets/components/ticket-frame";
import { getWorkspaceContext } from "@/features/workspaces/queries";
import { formatDate, formatTime } from "@/lib/format";
import { slackChannelName } from "@/lib/slack";

export async function generateMetadata({ params }: PageProps<"/service-center/tickets/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: number };
}

/** The ticket page. The frame is shared; the open step's form renders under its title in the rail. */
export default async function TicketPage({ params, searchParams }: PageProps<"/service-center/tickets/[number]">) {
  const [{ number }, sp, user, ws] = await Promise.all([params, searchParams, getCurrentUser(), getWorkspaceContext()]);
  if (!user) redirect(SIGN_IN_PATH);
  const [detail, totals] = await Promise.all([getTicketDetail(number), ws.current ? countTickets(ws.current.id) : Promise.resolve(null)]);
  if (!detail) notFound();
  const t = detail.ticket;
  const canAct = canActOn(user.grants, t.stage, t.workspace_id, t.brand_id);
  // The step form keeps optimistic local state; remount it whenever the server data it started from changes.
  const revision = [t.stage, t.updated_at, ...detail.steps.map((s) => `${s.answer}${s.done_at}`), detail.tests.map((x) => `${x.attempt}${x.kind}${x.result}`).join(","), detail.messages.length, detail.events.length].join("|");

  let step: React.ReactNode = null;
  if (t.stage !== "closed") {
    const stage = t.stage as Step;
    const s = stepOf(detail, stage);
    const authors = messageAuthors(detail);
    const slackKind = stage === "supply" ? "parts_needed" : "cannot_replicate";
    const post = [...detail.messages].reverse().find((m) => m.channel === "slack" && m.kind === slackKind);
    // Back goes to the last step actually worked, never into a skipped one.
    const backTo = [...STEPS].slice(0, STEPS.indexOf(stage)).reverse().find((x) => !stepOf(detail, x)?.skipped) ?? null;
    const shippedEmail = detail.messages.find((m) => m.channel === "email" && m.kind === "shipped") ?? null;
    const shipTo = t.return_to_everett ? (ws.current?.fulfillment_address as Address | null) : t.ship_to;
    step = (
      <StepForm
        key={revision}
        number={t.number}
        stage={stage}
        answer={s?.answer ?? null}
        notes={s?.notes ?? ""}
        doneAt={s?.done_at ?? null}
        answeredAt={s?.answer != null ? s.updated_at : null}
        canUnpark={stage === "inspect" && s?.answer === false}
        backTo={backTo}
        needsPayment={t.needs_payment}
        issue={t.issue}
        inspectNotes={stepOf(detail, "inspect")?.notes ?? null}
        payment={{ amount: t.payment_amount, invoiceSentAt: t.invoice_sent_at }}
        tests={{
          attempt: t.test_attempt,
          passed: detail.tests.filter((x) => x.attempt === t.test_attempt && x.result === "pass").map((x) => x.kind as TestKind),
          previousFails: detail.tests.filter((x) => x.attempt < t.test_attempt && x.result === "fail").map((x) => ({ attempt: x.attempt, kind: x.kind as TestKind, note: x.note })),
        }}
        ship={{ carrier: t.ship_carrier ?? "", tracking: t.ship_tracking ?? "", labelUrl: t.label_url ?? "", shipTo, everett: t.return_to_everett, email: t.customer_email, shippedEmailAt: shippedEmail ? `${formatDate(shippedEmail.created_at)} · ${formatTime(shippedEmail.created_at)}` : null }}
        customer={t.customer_name}
        watch={t.watch}
        slackChannel={slackChannelName()}
        slack={post ? { postedAt: `${formatDate(post.created_at)} · ${formatTime(post.created_at)}`, by: ((post.created_by && authors.get(post.created_by)) || "Pivot").split(/\s+/)[0], body: post.body, replies: post.reply_count, lastReply: post.last_reply, failed: post.status === "failed" ? (post.error ?? "unknown error") : null, repliesError: post.replies_error ?? null } : null}
        benchPhotos={detail.photos.filter((x) => x.kind === "bench").map((x) => ({ id: x.id, path: x.storage_path }))}
        canAct={canAct}
        isAdmin={isAdminOf(user.grants, t.workspace_id)}
      />
    );
  }

  return (
    <>
      <ServiceCenterTabs active={t.stage === "closed" ? "closed" : "bench"} counts={{ bench: totals?.open ?? null, incoming: null, closed: totals?.closed ?? null }} />
      <TicketFrame detail={detail} user={user} workspaceName={ws.current?.name ?? "Pivot"} moveFailed={sp.move === "failed"}>
        {step}
      </TicketFrame>
    </>
  );
}
