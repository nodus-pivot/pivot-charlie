# Pivot Charlie

Nodus Watches' repair ticketing, second demo. Next.js 16 + Supabase. New tickets arrive from the
Google Sheet "Nodus Warranty Claims" (Incoming Watches tab); accepting one moves the row to the
current month tab and creates the ticket here.

## Local setup

1. `npm install` (Node 24+; on this Mac `export PATH=/opt/homebrew/bin:$PATH`).
2. `.env.local` holds the Supabase URL and keys, the Google service-account key (base64 JSON) and
   the sheet ID. Ask an owner for a copy; it is never committed.
3. `npx supabase link --project-ref vmzypgrryjspytnxhipm` once, then:
   - `npm run db:push` applies migrations in `supabase/migrations`.
   - `npm run db:seed` regenerates `supabase/seed.sql` from `supabase/seed.py` and applies it.
     Re-run any time to reset the demo tickets and demo people; tickets created in the app are kept.
   - `npm run db:types` regenerates `src/lib/supabase/database.types.ts`. Run it after every
     migration and commit the result.
4. `npm run dev`.

## Demo sign-ins

Every demo account uses the password `PivotDemo2026!!` (the seed resets it).

| Email | Role |
|---|---|
| owner.demo@pivot.test | owner (Wes) |
| cullen.demo@pivot.test | owner (Cullen) |
| rane.demo@pivot.test | watchmaker, Nodus |
| nodus.rep.demo@pivot.test | brand rep, Nodus |

## Deploys

Pushes to `main` deploy to Vercel (project `pivot-charlie`). Preview deployments get the same
environment variables.

## Google Sheet

The app acts as the service account `pivot-charlie@pivot-charlie-nodus.iam.gserviceaccount.com`,
which must be an Editor on the sheet. Pivot reads Incoming Watches, moves accepted rows to the
`MMM YYYY` tab (creating it if missing) and dismissed rows to `Archive`, and writes back only the
month row's Solution, Payment Received?, Repair Completed? and Shipped Back? cells.
