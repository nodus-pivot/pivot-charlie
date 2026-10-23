import { STAGES, type Stage } from "@/features/pipeline";
import { formatDate } from "@/lib/format";
import { countryName, isCountryCode, usStateName } from "@/lib/country";

/**
 * The customer's view of the pipeline. Pure: maps the status payload from
 * customer_ticket_status() to the public steps with their dates.
 */

export type PublicStatus = {
  number: string;
  watch: string | null;
  first_name: string;
  submitted_at: string;
  stage: Stage;
  entered: Partial<Record<Stage, string>>;
  received_at: string | null;
  shipped_at: string | null;
  closed_at: string | null;
  needs_payment: boolean;
  carrier: string | null;
  tracking: string | null;
  return_to_everett: boolean;
  /** City, state and country only; the street and postal code never reach the browser. */
  ship_to: { city?: string | null; state?: string | null; country?: string | null } | null;
  address_change_pending: boolean;
};

export type PublicStep = { key: Stage; label: string; date: string | null; state: "done" | "current" | "future" };

const LABELS: Record<Stage, string> = {
  check_in: "Request received",
  inspect: "Watch received, diagnosis underway",
  supply: "Getting parts ready for your repair",
  repair: "Repair in progress",
  test: "Testing the repair",
  payment: "Awaiting payment",
  ship: "On its way back to you",
  closed: "Complete",
};

export function publicLabel(stage: Stage): string {
  return LABELS[stage];
}

/** The steps a customer sees: Payment only appears on a paid repair. */
export function publicSteps(s: PublicStatus, now: Date = new Date()): PublicStep[] {
  const order = STAGES.filter((k) => k !== "payment" || s.needs_payment);
  const current = order.indexOf(s.stage);
  return order.map((key, i) => {
    const at =
      key === "check_in" ? s.submitted_at
      : key === "inspect" ? (s.received_at ?? s.entered.inspect ?? null)
      : key === "ship" ? (s.shipped_at ?? s.entered.ship ?? null)
      : key === "closed" ? (s.closed_at ?? null)
      : (s.entered[key] ?? null);
    const state = i < current ? "done" : i === current ? "current" : "future";
    return { key, label: LABELS[key], date: state === "future" ? null : at ? formatDate(at, now) : null, state };
  });
}

/** The "right now" line under the current step. */
export function rightNowNote(s: PublicStatus): string {
  switch (s.stage) {
    case "check_in":
      return "We have your request. Once the watch is on the bench the diagnosis starts.";
    case "inspect":
      return "The watchmaker is looking it over.";
    case "supply":
      return "Parts are on their way to the bench. We'll update the estimate as they arrive.";
    case "repair":
      return "On the bench now.";
    case "test":
      return "Timing, water resistance and a final look before it ships.";
    case "payment":
      return "The repair is done. It ships as soon as the invoice is settled.";
    case "ship":
      return s.return_to_everett ? "Heading back to Nodus fulfillment first." : "Packed and on its way.";
    case "closed":
      return s.tracking ? `Shipped ${s.carrier ?? ""} ${s.tracking}`.trim() : "Thanks for sending it in.";
  }
}

/** "Santa Monica, California" at home; "Nantes, France" abroad. */
export function maskedAddress(a: PublicStatus["ship_to"]): string {
  if (!a) return "";
  const country = (a.country ?? "US").toUpperCase();
  if (country === "US" || !a.country) return [a.city, usStateName(a.state)].filter(Boolean).join(", ");
  const name = isCountryCode(country) ? countryName(country) : a.country ?? "";
  return [a.city, name].filter(Boolean).join(", ");
}
