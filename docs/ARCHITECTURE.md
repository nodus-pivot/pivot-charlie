# Architecture

How Pivot Charlie is organized and why. Read this before adding a screen. It follows the shape
that worked in pivot-beta; the differences are called out.

## Three layers

1. **`src/app` is routing only.** Every `page.tsx` fetches through a query function and renders a
   feature component. No business logic in route files.
2. **`src/features/<domain>`** holds the real code, grouped by what the business calls things:
   `auth`, `workspaces`, `intake` (the sheet), `tickets`, `pipeline`, `ops`, `people`. Each feature
   owns its `queries.ts` (reads), `actions.ts` (writes), and components.
3. **`src/components/ui`**, **`src/components/layout`** and **`src/lib`** are shared, domain-free
   code: primitives, the shell, Supabase clients, the Google Sheets client, formatters.

```
src/
  proxy.ts                        refresh the session cookie; redirect signed-out users
  app/
    layout.tsx                    fonts, globals.css
    (public)/                     home, /status, /sign-in
    (app)/                        everything behind sign-in
      service-center/             my bench, incoming, tickets/new, tickets/[number]
      ops/                        watches, components, users, workspace
  features/
    auth/ workspaces/ intake/ tickets/ pipeline/ ops/ people/
  components/
    ui/                           button, eyebrow, field, chip, segmented, dialog …
    layout/                       wordmark, public-nav, app-nav, photo band
  lib/
    supabase/                     server.ts, client.ts, admin.ts, database.types.ts (generated)
    google/                       sheets.ts (service account)
    format.ts, utils.ts
```

## Rules

- **Reads happen in server components** through a feature's `queries.ts`, with a Supabase client
  created for the current request. Row-level security is the authorization; there is no second
  permission system in the app, only `permissions.ts` helpers that mirror the database.
- **Every write is a server action**: validate with zod, write, `revalidatePath`. Autosave calls
  the same actions. `set_stage()` in the database is the only thing that changes `tickets.stage`
  and it enforces every gate; the UI mirrors the gates only to grey buttons and explain why.
- **The sheet is written in exactly three places**: move a row to the month tab (create), move a
  row to Archive (dismiss), and the write-back drainer that applies `sheet_writebacks`. All three
  live in `features/intake`. Nothing else imports the Sheets client.
- **`features/pipeline` has no React.** Stage order, labels, gate explanations and summaries are
  plain TypeScript with vitest tests.
- **Database types are generated**: `npm run db:types` after every migration, committed together.
- **Server-only secrets** (service role key, Google key) are read only in `lib/supabase/admin.ts`
  and `lib/google/sheets.ts`.

## Styling

Tailwind 4 with the Atelier tokens declared once in `globals.css` (`@theme`) and used by name:
`bg-ground`, `bg-panel`, `border-rule`, `border-border-strong`, `text-ink / -2 / -3`,
`text-gold`, `text-gold-light`, `text-amber`, `text-green`, `text-coral`; `font-display`
(Cormorant Garamond 500/600), `font-sans` (Inter), `font-mono` (JetBrains Mono). Radii: `rounded-xs`
(2px: inputs, thumbnails), `rounded-md` (8px: composer), `rounded-pill` (chips). No shadows; depth
is a 1px rule plus the darker panel. Primary buttons are a gold outline, never a fill. Icons:
Phosphor regular, imported from `@phosphor-icons/react/dist/ssr` in server components.

## Deliberately not used

No client state library. No Cache Components mode (the app is per-user and small). No shadcn:
the handful of primitives the mocks need are written directly against the tokens.
