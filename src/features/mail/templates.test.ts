import { describe, expect, it } from "vitest";
import { renderTicketEmail, trackingUrl } from "./templates";

const base = { number: "NW260022", watch: "TrailTrekker", customerName: "Michael Powell", statusUrl: "https://pivot-charlie.vercel.app/status" };

describe("renderTicketEmail", () => {
  it("received: subject, issue box and the three steps", () => {
    const e = renderTicketEmail("received", { ...base, issue: "Bezel insert is the wrong one." });
    expect(e.subject).toBe("Your TrailTrekker has arrived and is in diagnostics — Ticket NW260022");
    expect(e.html).toContain("Issue flagged");
    expect(e.html).toContain("Bezel insert is the wrong one.");
    expect(e.html).toContain("What happens next");
    expect(e.text).toContain("Hi Michael,");
    expect(e.text).toContain("3. Testing &amp; return".replace("&amp;", "&"));
  });

  it("tested: mentions the payment request on paid repairs only", () => {
    expect(renderTicketEmail("tested", { ...base, needsPayment: true }).text).toContain("payment request");
    expect(renderTicketEmail("tested", { ...base, needsPayment: false }).text).not.toContain("payment request");
    expect(renderTicketEmail("tested", base).subject).toBe("Testing passed — your TrailTrekker will be sent home soon — Ticket NW260022");
  });

  it("invoice: amount, what it covers, pay button", () => {
    const e = renderTicketEmail("invoice", { ...base, amount: 2, payUrl: "https://invoice.stripe.com/i/x", repairNotes: "Bezel replaced.", dueAt: "2026-10-31T12:00:00Z" });
    expect(e.subject).toBe("Payment request for your TrailTrekker repair — Ticket NW260022");
    expect(e.html).toContain("<strong>$2.00</strong>");
    expect(e.html).toContain("What this covers");
    expect(e.html).toContain('href="https://invoice.stripe.com/i/x"');
    expect(e.text).toContain("Pay now: https://invoice.stripe.com/i/x");
    expect(e.text).toContain("good until October 31");
  });

  it("shipped: tracking box and carrier link", () => {
    const e = renderTicketEmail("shipped", { ...base, carrier: "USPS", tracking: "9405 5501 0615 1065 7804 86" });
    expect(e.subject).toBe("Your TrailTrekker has shipped — Ticket NW260022");
    expect(e.html).toContain("USPS · Tracking number");
    expect(e.html).toContain("tools.usps.com/go/TrackConfirmAction?tLabels=9405550106151065780486");
    const none = renderTicketEmail("shipped", { ...base, carrier: null, tracking: null });
    expect(none.html).not.toContain("Track your package");
  });

  it("escapes customer text", () => {
    const e = renderTicketEmail("received", { ...base, issue: "<script>alert(1)</script> & co" });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
  });
});

describe("trackingUrl", () => {
  it("picks the carrier from the name or the number shape", () => {
    expect(trackingUrl("UPS", "1Z 999 AA1 01 2345 6784")).toContain("ups.com/track?tracknum=1Z999AA10123456784");
    expect(trackingUrl(null, "1Z999AA10123456784")).toContain("ups.com");
    expect(trackingUrl("FedEx", "7489 2231 0001")).toContain("fedex.com");
    expect(trackingUrl(null, "9400 1108 4007 2231 0001")).toContain("usps.com");
    expect(trackingUrl("Courier", "ABC")).toBeNull();
    expect(trackingUrl("USPS", "")).toBeNull();
  });
});
