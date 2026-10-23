import Link from "next/link";
import type { ReactNode } from "react";
import { PageBand } from "@/components/layout/page-band";
import { Chip } from "@/components/ui/chip";
import type { CurrentUser } from "@/features/auth/queries";
import { canActOn, isAdminOf } from "@/features/pipeline";
import { daysBetween, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TicketDetail } from "../detail";
import { closedRows, parkedState, statusWord, stepOf, stepRows, type SummaryInput } from "../summary";
import { Dossier, type DossierData } from "./dossier";
import { StepRail } from "./step-rail";
import { ClosedView } from "./closed-view";
import { AddressRequest } from "./address-request";
import type { Address } from "@/lib/address";
import { photoUrl } from "@/lib/photos";

/**
 * Band, dossier and step rail around whatever the current step renders.
 * `children` is the current step's form; the rail places it under the
 * open step's title.
 */
export function summaryInput(detail: TicketDetail): SummaryInput {
  const t = detail.ticket;
  return {
    stage: t.stage,
    needs_payment: t.needs_payment,
    payment_amount: t.payment_amount,
    closed_at: t.closed_at,
    ship_carrier: t.ship_carrier,
    ship_tracking: t.ship_tracking,
    steps: detail.steps,
    tests: detail.tests,
    test_attempt: t.test_attempt,
    messages: detail.messages.map((m) => ({ channel: m.channel, kind: m.kind, created_at: m.created_at, reply_count: m.reply_count })),
  };
}

export function TicketFrame({
  detail,
  user,
  workspaceName,
  moveFailed,
  children,
}: {
  detail: TicketDetail;
  user: CurrentUser;
  workspaceName: string;
  moveFailed: boolean;
  children: ReactNode;
}) {
  const t = detail.ticket;
  const input = summaryInput(detail);
  const parked = parkedState(input);
  const awaitingPayment = t.stage === "payment" && t.needs_payment && stepOf(input, "payment")?.answer !== true;
  const status = statusWord({ stage: t.stage, closed_at: t.closed_at, parked, awaiting_payment: awaitingPayment });
  const steps = stepRows(input);
  const closed = t.stage === "closed"
    ? closedRows({ ...input, issue: t.issue, source: t.source, coverage: t.coverage, check_in_by: stepOf(input, "check_in")?.done_by_name ?? null })
    : null;
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";
  const currentExtras = parked
    ? {
        badge: <Chip tone={parked.kind === "waiting_for_parts" ? "amber" : "coral"}>{parked.kind === "waiting_for_parts" ? "waiting for parts" : "parked"}</Chip>,
        aside: parked.since ? `${parked.kind === "waiting_for_parts" ? "waiting" : "parked"} ${daysBetween(parked.since)}d` : undefined,
      }
    : undefined;
  const editable = (t.stage === "check_in" && canActOn(user.grants, "check_in", t.workspace_id, t.brand_id)) || isAdminOf(user.grants, t.workspace_id);
  const bandPhoto = detail.photos.find((p) => p.kind === "bench")?.storage_path ?? detail.photos[0]?.storage_path ?? null;

  const dossier: DossierData = {
    number: t.number,
    customer_name: t.customer_name,
    customer_email: t.customer_email,
    customer_phone: t.customer_phone,
    ship_to: t.ship_to,
    watch: t.watch,
    serial: t.serial,
    coverage: t.coverage,
    received_at: stepOf(input, "check_in")?.done_at ?? null,
    issue: t.issue,
    bench_note: t.bench_note,
    photos: detail.photos.map((p) => ({ id: p.id, path: p.storage_path, kind: p.kind })),
    comments: detail.events
      .filter((e) => e.type === "comment" && e.body)
      .map((e) => ({ id: e.id, actor: e.actor_name ?? "Someone", date: formatDate(e.created_at), body: e.body! })),
  };

  return (
    <>
      <PageBand
        eyebrow={`${workspaceName} · ${first}`}
        title={t.customer_name}
        photo={bandPhoto ? photoUrl(bandPhoto) : undefined}
        aside={
          <span className="text-base text-ink-2">
            {t.watch} · <span className="font-mono">{t.number}</span> ·{" "}
            <span className={cn(status.tone === "gold" ? "text-gold-light" : status.tone === "amber" ? "text-amber" : status.tone === "coral" ? "text-coral" : "text-green")}>{status.text}</span>
            {t.priority && t.stage !== "closed" ? <> · <span className="text-coral">priority</span></> : null}
          </span>
        }
      />
      {parked ? (
        <p className={cn("flex flex-wrap items-center gap-3 border-b px-4 py-2 text-[13px] sm:px-8 lg:px-12", parked.kind === "waiting_for_parts" ? "border-amber/40 bg-amber/10 text-amber" : "border-coral/40 bg-coral/10 text-coral")}>
          {parked.kind === "waiting_for_parts"
            ? "Parked. Waiting on parts from Nodus; the request is on Slack."
            : "Parked. Could not replicate the reported issue. Nodus customer service is following up with the customer on Slack."}
          {parked.since ? <span className="ml-auto text-ink-3">since {formatDate(parked.since)} · {daysBetween(parked.since)}d</span> : null}
        </p>
      ) : null}
      {moveFailed || (detail.sheetRow && !detail.sheetRow.moved_at) ? (
        <p className="flex items-center gap-3 border-b border-amber/40 bg-amber/10 px-4 py-2 text-[13px] text-amber sm:px-8 lg:px-12">
          The ticket is here, but its row did not move in the Google Sheet.{" "}
          <Link href="/service-center/incoming" className="underline underline-offset-2">Retry from Incoming</Link>
        </p>
      ) : null}
      {(() => {
        const req = [...detail.events].reverse().find((e) => e.type === "address_update_requested");
        const resolved = req ? detail.events.some((e) => (e.type === "address_update_accepted" || e.type === "address_update_declined") && e.created_at > req.created_at) : true;
        return req && !resolved && t.stage !== "closed" ? (
          <AddressRequest number={t.number} eventId={req.id} address={(req.payload as Address) ?? {}} canAct={canActOn(user.grants, t.stage, t.workspace_id, t.brand_id)} />
        ) : null;
      })()}
      {t.return_to_everett ? (
        <p className="flex items-center gap-3 border-b border-rule bg-panel px-4 py-2 text-[13px] text-ink-2 sm:px-8 lg:px-12">
          <Chip tone="neutral">Return to Everett</Chip> Ships to Nodus fulfillment after the repair, not to the customer.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Dossier data={dossier} editable={editable} canComment />
        {closed ? <ClosedView number={t.number} rows={closed} canReopen={isAdminOf(user.grants, t.workspace_id)} /> : <StepRail steps={steps} current={currentExtras}>{children}</StepRail>}
      </div>
    </>
  );
}
