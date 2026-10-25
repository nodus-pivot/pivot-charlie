# Schema v2 · what changed and why

Baseline migration `supabase/migrations/20261023000000_baseline.sql` (Oct 23, 2026). It replaced
the nine migrations of the first build; the linked database was reset and reseeded. Full column
reference: https://claude.ai/artifact/EuP7YyMAQppYTEt3BKk3CG

## Stages

| Before | After |
|---|---|
| check_in → inspect → supply → **fix** → test → ship → closed | check_in → inspect → supply → **repair** → test → **payment** → ship → closed |

Payment is skipped (marked `skipped`) on tickets without `needs_payment`.

## Tables

| Table | Change | Why |
|---|---|---|
| `tickets` | `watch text` replaces `watch_id` and `customer_model_text`. Loses the four step notes, `received_at`, `payment_received`, `bench_minutes`. Gains `stripe_customer_id`, `ship_carrier`, `ship_tracking`, `label_url`. | Intake data plus the stage pointer. No catalog. |
| `ticket_steps` | **New.** One row per step per ticket: `answer`, `notes`, `done_at`, `done_by`, `skipped`. PK (ticket_id, stage). Created by `create_ticket`. | Every step is the same shape. The rail, the summary, Back and the public status page read this one table. |
| `ticket_messages` | **New.** Every Slack post and email: channel, kind, recipient, subject, body, status (`logged` / `sent` / `failed`), Slack ts in `external_id`, reply_count. | The Slack card needs rows that update. Emails sit here as `logged` until sending is turned on. |
| `ticket_invoices` | **New (round 9).** One row per Stripe invoice: `stripe_invoice_id`, `hosted_url`, `amount`, `status` (`open` / `paid` / `void` / `expired`), `created_at`, `due_at` (7 days), `paid_at`, `checked_at`, `error`. A partial unique index allows one `open` row per ticket. | The Payment step sends an invoice and the ticket page asks Stripe for its status on load (2-minute throttle). A paid row ticks the payment step through a trigger. Paid, void and expired are final; a new row replaces them. |
| `brands` | Gains `slack_channel_id`. | Channel per brand; the token stays in Vercel. |
| `ticket_tests`, `ticket_events`, `ticket_photos`, `sheet_rows`, `sheet_writebacks`, people tables | Unchanged. | |
| `ticket_findings`, `ticket_parts`, `shipments`, `watches`, `parts`, `watch_parts` | **Dropped.** | Free text everywhere; one shipment per ticket lives on the ticket. |

Step meanings: check_in `answer` = I have the watch, `done` = received · inspect `answer` = issue present
(No parks), `notes` = comments · supply `answer` = have parts (No = list in `notes` + Slack), `done` =
had or received · repair `answer` = complete, `notes` = what you did · test `answer` unused, passes in
`ticket_tests`, `notes` = test notes · payment `answer` = paid, `skipped` = warranty · ship `done` = shipped.

## Enums

Dropped `component`, `finding_condition`, `finding_action`. Added `message_channel` (slack, email),
`message_kind` (parts_needed, cannot_replicate, received, shipped, invoice), `message_status` (logged, sent, failed),
`invoice_status` (open, paid, void, expired).

## Functions and view

- `advance(ticket, override)` replaces `set_stage`. Gate = the current step row plus its rule: check_in
  answer · inspect answer Yes and notes · supply answer Yes or done · repair answer · three passes ·
  payment answer or admin override · tracking or label. Marks the step done, moves one stage, skips
  Payment on warranty, queues the sheet cells (Solution, Repair Completed?, Shipped Back?).
- `send_back(ticket, to)` clears `done_at` from that step on; Test → Repair bumps `test_attempt`.
- `skip_to_ship(ticket)` from Inspect: Supply, Repair, Test (and Payment on warranty) marked skipped.
- `reopen(ticket)` admins only: closed → ship.
- `ticket_board` computes `received_at`, `parked`, `waiting_for_parts`, `awaiting_payment`,
  `payment_received`, `tests_passed`, `ship_ready`, `outcome`, `slack_replies`, and from the latest invoice
  `invoice_sent_at`, `invoice_status`, `invoice_due_at`, `invoice_url`. Nothing is stored as a flag.
- `customer_ticket_status` reads `ticket_steps`; Payment shows as "Awaiting payment" on paid repairs.
- The `Payment Received?` sheet cell follows the payment step's `answer` through a trigger.

## Still logged, not sent

Customer emails (`received`, `shipped`, `invoice` with the Stripe pay link) are written to `ticket_messages` with status `logged`. Nothing
emails anyone until the sheet's test rows carry safe addresses. Slack posts go to the one channel in
`SLACK_CHANNEL_ID`; reply counts need the `channels:history` scope and a reinstall.

## Stripe

The restricted key lives in `STRIPE_API` (Vercel and `.env.local`). It needs Customers, Invoices and Invoice items
write access. Invoices use `collection_method: send_invoice` with `days_until_due: 7` and are never emailed by
Stripe: Pivot logs the pay link as an `invoice` email and shows it on the Payment step. No webhook yet; the ticket
page polls `invoices.retrieve` for the open invoice.
