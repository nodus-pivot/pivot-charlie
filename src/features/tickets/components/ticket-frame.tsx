import Link from "next/link";
import type { ReactNode } from "react";
import { PageBand } from "@/components/layout/page-band";
import { Chip } from "@/components/ui/chip";
import type { CurrentUser } from "@/features/auth/queries";
import { canActOn } from "@/features/pipeline";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TicketDetail } from "../detail";
import { statusWord, stepRows } from "../summary";
import { Dossier, type DossierData } from "./dossier";
import { StepRail } from "./step-rail";

/**
 * Band, dossier and step rail around whatever the current step renders.
 * `children` is the current step's form; the rail places it under the
 * open step's title.
 */
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
  const parked = t.stage === "supply" && detail.parts.some((p) => p.requested_at && !p.have_it && !p.arrived_at);
  const status = statusWord({ stage: t.stage, closed_at: t.closed_at, parked });
  const steps = stepRows({
    stage: t.stage,
    bench_minutes: t.bench_minutes,
    closed_at: t.closed_at,
    received_at: t.received_at,
    events: detail.events,
    findings: detail.findings.map((f) => ({ component: f.component, action: f.action, condition: f.condition, part: f.part, done_at: f.done_at })),
    parts: detail.parts.map((p) => ({ have_it: p.have_it, arrived_at: p.arrived_at, requested_at: p.requested_at, label: p.label, part: p.part })),
    tests: detail.tests,
    test_attempt: t.test_attempt,
    shipment: detail.shipment,
  });
  const first = user.profile.display_name.split(/\s+/)[0] ?? "";
  const editable = t.stage === "check_in" && canActOn(user.grants, "check_in", t.workspace_id, t.brand_id);

  const dossier: DossierData = {
    number: t.number,
    customer_name: t.customer_name,
    customer_email: t.customer_email,
    customer_phone: t.customer_phone,
    ship_to: t.ship_to,
    watch_id: t.watch_id,
    watch_name: detail.watch.name,
    warranty_months: detail.watch.warranty_months,
    serial: t.serial,
    coverage: t.coverage,
    received_at: t.received_at,
    issue: t.issue,
    bench_note: t.bench_note,
    photos: detail.photos.filter((p) => p.kind === "customer").length,
    comments: detail.events
      .filter((e) => e.type === "comment" && e.body)
      .map((e) => ({ id: e.id, actor: e.actor_name ?? "Someone", date: formatDate(e.created_at), body: e.body! })),
    catalog: detail.catalog,
  };

  return (
    <>
      <PageBand
        eyebrow={`${workspaceName} · ${first}`}
        title={t.customer_name}
        aside={
          <span className="text-base text-ink-2">
            {detail.watch.name} · <span className="font-mono">{t.number}</span> ·{" "}
            <span className={cn(status.tone === "gold" ? "text-gold-light" : status.tone === "amber" ? "text-amber" : "text-green")}>{status.text}</span>
            {t.priority && t.stage !== "closed" ? <> · <span className="text-coral">priority</span></> : null}
            {t.needs_payment && !t.payment_received && t.stage !== "closed" ? <> · <span className="text-amber">invoice unpaid</span></> : null}
          </span>
        }
      />
      {moveFailed || (detail.sheetRow && !detail.sheetRow.moved_at) ? (
        <p className="flex items-center gap-3 border-b border-amber/40 bg-amber/10 px-4 py-2 text-[13px] text-amber sm:px-8 lg:px-12">
          The ticket is here, but its row did not move in the Google Sheet.{" "}
          <Link href="/service-center/incoming" className="underline underline-offset-2">Retry from Incoming</Link>
        </p>
      ) : null}
      {t.return_to_everett ? (
        <p className="flex items-center gap-3 border-b border-rule bg-panel px-4 py-2 text-[13px] text-ink-2 sm:px-8 lg:px-12">
          <Chip tone="neutral">Return to Everett</Chip> Ships to Nodus fulfillment after the repair, not to the customer.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Dossier data={dossier} editable={editable} canComment />
        <StepRail steps={steps}>{children}</StepRail>
      </div>
    </>
  );
}
