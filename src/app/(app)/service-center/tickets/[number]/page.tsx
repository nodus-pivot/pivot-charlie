import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/queries";
import { SIGN_IN_PATH } from "@/features/auth/redirect";
import { STAGE_LABELS, canActOn, isAdminOf } from "@/features/pipeline";
import type { Address } from "@/lib/address";
import { getTicketDetail } from "@/features/tickets/detail";
import { CheckInStep } from "@/features/tickets/components/check-in-step";
import { InspectStep } from "@/features/tickets/components/inspect-step";
import { SupplyStep } from "@/features/tickets/components/supply-step";
import { FixStep } from "@/features/tickets/components/fix-step";
import { TestStep } from "@/features/tickets/components/test-step";
import { ShipStep } from "@/features/tickets/components/ship-step";
import type { TestKind } from "@/features/tickets/actions";
import { TicketFrame } from "@/features/tickets/components/ticket-frame";
import { getVisibleBrands, getWorkspaceContext } from "@/features/workspaces/queries";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/service-center/tickets/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: number };
}

/** The ticket page. The frame is shared; what renders under the open step depends on the stage. */
export default async function TicketPage({ params, searchParams }: PageProps<"/service-center/tickets/[number]">) {
  const [{ number }, sp, user, ws, brands] = await Promise.all([params, searchParams, getCurrentUser(), getWorkspaceContext(), getVisibleBrands()]);
  if (!user) redirect(SIGN_IN_PATH);
  const detail = await getTicketDetail(number);
  if (!detail) notFound();
  const t = detail.ticket;
  const canAct = canActOn(user.grants, t.stage, t.workspace_id, t.brand_id);
  // Step components keep optimistic local state; remount them whenever the server data they started from changes.
  const revision = [t.stage, t.updated_at, ...detail.findings.map((f) => f.updated_at), ...detail.parts.map((p) => p.updated_at), detail.tests.map((x) => `${x.attempt}${x.kind}${x.result}`).join(","), detail.shipment?.updated_at, detail.events.length].join("|");

  let step: React.ReactNode;
  if (t.stage === "check_in") {
    const sourceLine = `${t.source === "sheet" ? "From the website" : "By hand"} · ${formatDate(t.created_at)}`;
    step = (
      <CheckInStep
        key={revision}
        number={t.number}
        sourceLine={sourceLine}
        received={!!t.received_at}
        priority={t.priority}
        needsPayment={t.needs_payment}
        returnToEverett={t.return_to_everett}
        canAct={canAct}
      />
    );
  } else if (t.stage === "inspect") {
    step = (
      <InspectStep
        key={revision}
        number={t.number}
        initial={detail.findings.map((f) => ({ component: f.component, condition: f.condition, action: f.action, partId: f.part_id }))}
        fits={detail.fits}
        note={t.inspect_note ?? ""}
        canAct={canAct}
      />
    );
  } else if (t.stage === "supply") {
    const findingComponent = new Map(detail.findings.map((f) => [f.id, f.component]));
    step = (
      <SupplyStep
        key={revision}
        number={t.number}
        rows={detail.parts.map((p) => ({
          id: p.id,
          findingId: p.finding_id,
          component: (p.finding_id ? findingComponent.get(p.finding_id) : undefined) ?? (p.part.component as (typeof detail.findings)[number]["component"]),
          name: p.part.name,
          sku: p.part.sku,
          label: p.label,
          qty: p.qty,
          haveIt: p.have_it,
          requestedAt: p.requested_at,
          arrivedAt: p.arrived_at,
        }))}
        fits={detail.fits}
        messages={detail.events.filter((e) => e.type === "parts_requested" && e.body).map((e) => ({ date: formatDate(e.created_at), body: e.body!, slack: ((e.payload as { slack?: { ok: boolean; error?: string } } | null)?.slack) ?? null }))}
        note={t.supply_note ?? ""}
        brandName={brands.find((b) => b.id === t.brand_id)?.name ?? "brand"}
        canAct={canAct}
      />
    );
  } else if (t.stage === "fix") {
    step = (
      <FixStep
        key={revision}
        number={t.number}
        rows={detail.findings.map((f) => ({
          id: f.id,
          component: f.component,
          action: f.action,
          partId: f.part_id,
          partName: f.part?.name ?? null,
          partSku: f.part?.sku ?? null,
          note: f.note ?? "",
          foundOnBench: f.found_at_stage === "fix",
          doneAt: f.done_at,
        }))}
        fits={detail.fits}
        note={t.fix_note ?? ""}
        benchMinutes={t.bench_minutes}
        coverage={t.coverage}
        canAct={canAct}
      />
    );
  } else if (t.stage === "test") {
    step = (
      <TestStep
        key={revision}
        number={t.number}
        attempt={t.test_attempt}
        passed={detail.tests.filter((x) => x.attempt === t.test_attempt && x.result === "pass").map((x) => x.kind as TestKind)}
        previousFails={detail.tests
          .filter((x) => x.attempt < t.test_attempt && x.result === "fail")
          .map((x) => ({ attempt: x.attempt, kind: x.kind as TestKind, note: x.note, date: formatDate(x.created_at) }))}
        note={t.test_note ?? ""}
        canAct={canAct}
      />
    );
  } else if (t.stage === "ship") {
    const sh = detail.shipment;
    step = (
      <ShipStep
        key={revision}
        number={t.number}
        customerName={t.customer_name}
        shipTo={t.ship_to}
        returnToEverett={t.return_to_everett}
        fulfillment={(ws.current?.fulfillment_address as Address | null) ?? null}
        initial={{
          carrier: (sh?.carrier as "usps" | "ups" | "fedex" | null) ?? null,
          tracking: sh?.tracking ?? "",
          handedOver: sh?.handed_over ?? false,
          signatureRequired: sh?.signature_required ?? false,
          emailCustomer: sh?.email_customer ?? true,
        }}
        payment={{ needed: t.needs_payment, amount: t.payment_amount, received: t.payment_received }}
        isAdmin={isAdminOf(user.grants, t.workspace_id)}
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
