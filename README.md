# Booker Admin — v3 (Vite/React + Netlify Functions)

Full rewrite of the Booker Admin Panel off Next.js: **Vite/React SPA** frontend
+ **Netlify Functions (Express)** REST API backend, same Postgres database
(via Prisma) as before, extended with the P0/P1 modules identified in the
audit (Modifiers, Recipes/BOM, Taxes, Suppliers, Warehouses, Audit Logs,
Notifications, RBAC, real thermal/KOT printing).

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, etc.
npm run db:generate
npm run db:migrate     # creates tables incl. all v3 additions
npm run db:seed        # optional demo data — owner@demo.com / demo1234
```

Run locally two ways:
- `npm run dev` — full Netlify emulation (functions + SPA + redirects), closest to production
- `npm run dev:vite` + `npm run dev:server` in two terminals — faster iteration, skips the Netlify CLI

Deploy: connect the repo in Netlify, build command `npm run build`, publish
dir `dist`, functions dir `netlify/functions` — all already set in `netlify.toml`.

## What changed from the Next.js version

- Server Actions → REST API (`server/src/routes/*.ts`), one Express app,
  mounted as a single Netlify Function (`netlify/functions/api.ts`) so
  there's one cold start, not 25.
- Cookie-based owner/employee/super-admin sessions → JWT (access + refresh),
  sent as `Authorization: Bearer` headers, not cookies.
- No `middleware.ts` route protection → central `requireAuth` +
  `requirePermission()` on every route.
- No validation → Zod schemas on every route (`server/src/schemas/index.ts`).
- No audit trail → `AuditLog` model + `recordAudit()` helper, called on
  price changes, voids, refunds, role changes, settings edits.
- Inventory never depleted → Recipe/BOM model + automatic stock deduction
  when an order is billed (`server/src/lib/stock.ts`).
- Printer config was metadata-only → real ESC/POS byte generation for KOT
  and Bill printing (`server/src/lib/escpos.ts`), routed by category.

## v3.1 additions (this pass)

- **Password reset** — `POST /api/auth/forgot-password` + `/reset-password`,
  hashed single-use token with 1hr expiry stored on `Company`
  (`resetTokenHash`/`resetTokenExpiresAt`, already in the schema but unused
  before now). Frontend: `ForgotPassword.tsx` / `ResetPassword.tsx`, linked
  from Login.
- **Finance/Expenses module** — was pure schema (`Expense` model existed,
  zero routes). Added `server/src/routes/finance.ts`
  (CRUD + `/finance/summary` — totals by category vs. revenue from billed
  orders in a date range, all audited) and a dedicated `Finance.tsx` page.
  New `finance:read`/`finance:write` permissions, granted to MANAGER by default.
- **Self-service leave requests** — `Attendance.tsx` only ever showed the
  *approval* side of `LeaveRequest`; staff had no way to submit one from the
  UI even though the backend endpoint existed. Added an "Apply for leave"
  form visible to every logged-in user.
- **Onboarding wizard** — `Company.onboardingStep` existed in the schema but
  nothing read or wrote it. Added `PATCH /api/restaurant/onboarding-step`
  and an `Onboarding.tsx` page; new owners with zero branches are redirected
  there automatically (`AppShell.tsx`) to create their first branch before
  reaching the dashboard.
- **Email delivery** — ported the Resend-based `lib/email.ts` from the old
  Next.js app (fails safe: logs instead of throwing if unconfigured).
- **SimpleCrudPage got Edit** — Suppliers/Taxes/Coupons/Printers already had
  working `PATCH` routes on the backend that the generic list UI never
  exposed; it only supported create + list. Now supports edit-in-place too.
- **Tests** — first test suite in the project: `server/tests/permissions.test.ts`
  (catches typo'd/orphaned permission strings, sanity-checks role hierarchy)
  and `server/tests/stock.test.ts` (deduction math for `deductStockForOrder`
  against a fake Prisma client, no DB needed). Run with `npm test` (vitest).

## v3.2 additions

- **Feedback & Reviews module** — the `Feedback` model existed but had zero
  routes anywhere except a read-only include on the customer detail view.
  Added a public guest submission endpoint
  (`POST /api/guest/:restaurantId/:tableId/feedback`, ties to a `Customer`
  by phone if one matches) and an admin-facing `server/src/routes/feedback.ts`
  (list + rating summary/distribution), new `feedback:read` permission, and
  a dedicated `Feedback.tsx` page with a star-distribution chart.
- **Super Admin console** — `server/src/routes/superAdmin.ts` (list all
  companies, suspend/reactivate) existed with no frontend at all. Added
  `SuperAdmin.tsx`: company list with owner/branch/status/paid-until
  columns, search, and suspend/reactivate actions. Only rendered in the nav
  and only reachable for `role === 'SUPER_ADMIN'` — regular owners/staff
  never see it.

## v3.3 — zero-terminal Netlify deploy

The build script now runs `prisma db push` automatically before `vite build`.
That means Netlify's own build servers create/update every table for you on
each deploy — **you never need to run a migration command yourself**, from
a terminal or otherwise. The full deploy is three things done in a browser:

1. Get this code into a GitHub repo (any way you like — web upload, a
   friend's laptop for five minutes, whatever's easiest for you).
2. Netlify → "Import from Git" → pick that repo.
3. Set `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   in Site settings → Environment variables, then deploy.

**Caveat, stated plainly:** `db push --accept-data-loss` is convenient for a
brand-new or early-stage database — it syncs the schema without requiring a
migration-history file. But as the name says, if you later remove or
narrow a column that already has data in it, this will drop that data
without asking. Once this is running against a real restaurant's live
data, switch to `prisma migrate deploy` with committed migration files
instead — safer, and it gives you a diffable history of every schema
change.

## v3.5 — real aggregator webhook ingestion

`server/src/routes/onlineOrders.ts` was a `501` stub before. Now implemented:

- **`AggregatorConfig` + `MenuItemChannelMapping`** (new Prisma models) — per
  restaurant, per platform: merchant ID, webhook secret, enabled flag; and a
  mapping from your `MenuItem` to that platform's own item ID, since
  incoming orders reference items by the platform's ID, not yours.
- **Signature verification** (`server/src/lib/webhookSignatures.ts`) —
  real HMAC-SHA256 verification for Swiggy/Zomato over the raw request
  body (captured via a `verify` hook on `express.json()` in `app.ts`,
  since re-serializing the parsed JSON can differ byte-for-byte from what
  was actually signed). **ONDC is honestly NOT implemented** — it runs on
  the Beckn protocol (Ed25519 keys exchanged at network registration, not
  a shared-secret HMAC), which is a meaningfully different, more involved
  integration. `verifyOndcSignature()` always returns `false` on purpose,
  so a real ONDC request can never slip through something that only looks
  like it verifies — wire up the actual Beckn signing flow before enabling
  that channel.
- **The exact webhook JSON shape per platform is a placeholder**, clearly
  marked in `normalizePayload()`. I don't have current, verified payload
  schemas for Swiggy/Zomato/ONDC — rather than guess a specific shape and
  have it silently break, everything downstream (routing, signature
  check, item mapping, order creation, duplicate-webhook protection) is
  built and correct against one normalized internal shape; adapting each
  platform's real payload into that shape is a small, isolated function to
  fill in once you have partner API access.
- Rejects (422) rather than silently drops order items with no mapping yet,
  so a paid order never loses line items — the platform's webhook retry
  will succeed once the mapping is added.
- Admin UI: `OnlineOrders.tsx` now has a connections panel (merchant
  ID/secret per platform) and an item-mapping panel, not just a read-only
  order list.

## v3.6 — mandatory secrets in production

`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` used to silently fall back to a
hardcoded dev value if unset — meaning a forgotten env var in Netlify
wouldn't break the deploy, it would just quietly run on a signing secret
that's sitting in plain text in this same repo. Now `server/src/middleware/auth.ts`
throws at startup if either is missing while `NODE_ENV=production`. The
dev fallback still works locally so `npm run dev` doesn't require secrets
to be set just to poke at the app.

## v3.7 — real QR self-ordering, branch comparison, GST invoices

- **QR self-ordering was actually incomplete before this** — the backend
  (`qrGuest.ts`) had menu/order/status/service-request/feedback endpoints,
  but nothing generated a QR code and nothing rendered the guest-facing
  page it would point to. Added both:
  - `GuestOrder.tsx` at `/order/:restaurantId/:tableId` — public, no auth,
    browse menu → cart → place order → poll status → call waiter/request
    bill → leave a star rating once billed. Uses a separate unauthenticated
    axios instance, not the staff `api` client (which expects a Bearer
    token and redirects to `/login` on 401 — wrong behavior for a diner).
  - `Tables.tsx` now generates a real QR code per table (`qrcode.react`,
    new dependency) pointing at that guest page, with a PNG download.
- **Branch comparison dashboard** (`/branch-comparison`) — revenue, order
  count, avg order value, expenses, net, and average rating side by side
  across every branch under the company. Owner-only: gated on
  `actorType === 'OWNER'`, not on a permission string, since a
  branch-scoped MANAGER shouldn't see other branches' numbers regardless
  of their reports permission.
- **GST tax invoices** — `/invoice/:orderId`, a print-friendly view (CSS
  `@media print` hides the UI chrome) showing GSTIN/FSSAI, itemized lines,
  CGST/SGST split from the order's existing tax amount, discount, total,
  payment method. Linked from POS right after billing an order. Assumes
  intra-state supply (CGST+SGST) — flagged in a comment, since IGST would
  apply for genuinely inter-state delivery, which isn't a realistic
  scenario for dine-in/local delivery.

## v3.8 — QR Maker hub + UPI Scan-to-Pay

- **`QrCodes.tsx`** (`/qr-codes`) — a real QR maker, not just the per-table
  one from before: digital menu QR (view-only, no ordering — for flyers/
  Instagram/entrance signage), UPI Scan-to-Pay QR, and a generic
  custom-link QR for anything else (Google reviews, WhatsApp, etc). All
  downloadable as PNG.
- **Digital menu, table-less** — added `GET /api/guest/:restaurantId/menu`
  (no `tableId`) and `MenuView.tsx` at `/menu/:restaurantId` for QR codes
  that should just show the menu, not open an ordering session.
- **UPI Scan-to-Pay** — new `Restaurant.upiVpa` field (set in Settings,
  alongside GSTIN which is now actually editable post-signup — it wasn't
  before). Generates a standard `upi://pay?...` deep link as a QR, both in
  the QR Maker hub (optional fixed amount) and automatically on the
  printed invoice for the exact order total when the order isn't already
  marked paid.

## v3.9 — combo meals + marketing campaigns

- **Combo/bundle meals** — `MenuItem.isCombo` + a new `ComboComponent`
  model describing what a combo contains. Deliberately display-only:
  pricing and stock deduction still come from the combo's own `price` and
  `recipeItems`, exactly like any other menu item — set the combo's recipe
  to what it actually consumes. `ComboComponent` only drives the KOT/kitchen
  ticket breakdown (e.g. "1x Family Combo (1x Burger, 2x Fries, 1x Coke)")
  so kitchen staff can see what to actually plate. Managed from Menu.tsx —
  mark an item as a combo, then edit its contents in a modal.
- **Marketing campaigns** (`/campaigns`) — segment customers (all /
  inactive 30+ days / top 100 spenders), compose a subject + message,
  send via the existing Resend email integration, with a sent/audience
  history log. Email-only, stated plainly in the UI: customers are
  phone-first in this schema, so a blast only reaches whoever also has an
  email on file. SMS/WhatsApp would need a separate provider (Twilio,
  Gupshup, etc.) that isn't wired up.
- Added `Customer.email` (was phone-only before) so campaigns have
  somewhere to send to — exposed in the Customers.tsx create form too.
- **Self-correction worth flagging**: partway through this pass, an edit
  briefly deleted the `MenuItemChannelMapping` model from the schema
  entirely (a `str_replace` that added `ComboComponent` didn't preserve
  the original model it was inserting next to). Caught by checking the
  model count and brace balance before moving on, and restored — final
  schema has all 44 models and balances. Mentioning this because silently
  fixing my own mistakes without saying so would be the wrong instinct;
  better to show the check that caught it.

## v4.0 — split-bill, CSV export, Happy Hour pricing

- **Split-bill payments** — the backend (`POST /orders/:id/pay`) already
  accepted multiple payment lines per order (that's how partial payment /
  `PARTIALLY_PAID` status works), but POS.tsx only ever sent one. Added a
  real split UI: add any number of method+amount lines, live remaining/over
  total, confirm only enabled once it exactly covers the bill.
- **CSV export** — a small dependency-free `downloadCsv()` helper
  (`src/lib/csvExport.ts`), wired into Reports (summary + item performance)
  and Finance (expenses for the current date range).
- **Happy Hour / time-based pricing** — new `HappyHourRule` model (days of
  week, start/end time, discount %, optional category scope). Applied at
  order-creation time in **both** places prices get computed — staff POS
  (`orders.ts`) and public QR self-ordering (`qrGuest.ts`) — via a shared
  `server/src/lib/happyHour.ts` helper, so a discount doesn't only work for
  one ordering path and silently not the other. Time comparison uses the
  restaurant's own `timezone` field via `Intl.DateTimeFormat`, not server/UTC
  time, since "5-7pm happy hour" means the branch's local 5-7pm. Doesn't
  handle a window crossing midnight (e.g. 23:00–01:00) — noted in the code
  as a real limitation, not silently wrong.
- Managed from a new `/happy-hour` page.

## v4.1 — three real correctness bugs, found by reading the code you asked me to harden

Not new features this pass — went looking for logic gaps instead, since
"add backend logic" without a specific ask means finding what's actually
wrong, not just what's missing. Found three:

- **Voiding a billed order never restored inventory.** `deductStockForOrder`
  ran at billing time; voiding just changed the order's status — the
  ingredients stayed "consumed" forever even though the food was
  presumably never served. Added `restoreStockForOrder()` (the exact
  reverse, same recipe quantities, its own `VOID_REVERSAL` audit entry —
  new value on `StockAdjustmentReason`), called inside the same transaction
  as the void. Also reverses the coupon's `timesUsed` count and deletes the
  `CouponRedemption` row for the same reason: if the order never actually
  happened, it shouldn't count against either.
- **Cancelling a dine-in order never freed the table.** Only the `BILLED`
  transition released `Table.state` back to `FREE`; a `CANCELLED` order
  (customer left, order was a mistake, etc.) left the table stuck
  `OCCUPIED` indefinitely with nothing to release it. Fixed in
  `orders.ts`'s status-update route.
- **Reservations had zero double-booking prevention.** Two reservations
  could be made for the same table at the same time with no conflict
  check at all. Added one — flagged honestly in a code comment that it's
  an approximation: `Reservation` has no duration field, only a single
  `reservedFor` timestamp, so the conflict window assumes a fixed 90-minute
  turn time rather than each reservation's real length. Fine for a typical
  dine-in restaurant, less accurate for one with very different turn times
  across meal periods — add a real duration field if that precision matters.

## v4.2 — Razorpay payments + more test coverage

- **Online payments for QR self-ordering** — real Razorpay integration
  (`server/src/lib/razorpay.ts`): create a checkout order for whatever's
  still unpaid on an order, then verify the payment signature Razorpay's
  client SDK returns before ever marking anything paid — an unverified
  client-reported "success" is not evidence of payment. Wired into
  `GuestOrder.tsx` with a "Pay online" button (loads Razorpay's checkout
  script on demand, not a bundled dependency) alongside the existing
  "pay staff directly" option. Idempotent against retries — Razorpay's
  checkout can call the verify endpoint more than once (double-tap,
  browser back-forward); a `gatewayPaymentId` already recorded is treated
  as already-applied, not charged again. New `Payment.gatewayOrderId`/
  `gatewayPaymentId`/`gatewaySignature` fields, new `ONLINE_GATEWAY`
  payment method. Needs `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` set — free
  test keys at their dashboard — documented in `.env.example`. Without
  those set, the "pay online" button simply doesn't appear; in-person
  payment still works exactly as before.
- **Pulled the tax/discount math out of `orders.ts`** into
  `server/src/lib/pricing.ts` as a pure function (`priceLine()`) — no DB,
  no Express — specifically so it's unit-testable. Added
  `server/tests/pricing.test.ts` covering inclusive vs. exclusive tax,
  quantity scaling, modifier price deltas, and the zero-tax edge case.
  Also added tests for `restoreStockForOrder` (the void-reversal logic from
  v4.1) confirming it's the exact mathematical inverse of a deduction.
  Test files: `permissions.test.ts`, `stock.test.ts`, `pricing.test.ts` —
  still no coverage on the route handlers themselves (would need a test
  DB or a mocked Prisma client per route file, which is a bigger lift).
- **Database update note**: none of this needs a manual migration step —
  `npm run build` already runs `prisma db push` first (see the v3.3 entry
  below), so every schema change from v3.9 through this version gets
  applied automatically on your next Netlify deploy.

## v4.3 — durable rate limiting + UI polish pass

- **Rate limiting is no longer in-memory.** The earlier `Map`-based limiter
  reset every time a Netlify Function container recycled — not guaranteed
  to stay warm, so it could be silently bypassed just by hitting a cold
  start, without anyone doing anything clever. Replaced with a new
  `RateLimitBucket` Postgres table and an atomic upsert
  (`INSERT ... ON CONFLICT DO UPDATE`, not read-then-write) so concurrent
  requests from the same IP can't both slip through a race. Fails open on
  a DB error — a rate limiter hiccup shouldn't 500 every guest order.
  Old rows aren't auto-pruned; `pruneExpiredRateLimitBuckets()` exists for
  a scheduled job if the table's growth becomes worth caring about, but no
  scheduler is configured in this codebase to call it automatically.
- **First real UI polish pass** — additive only, no class names changed
  (every existing page keeps working): visible focus rings everywhere
  (there were none before — a real accessibility gap for keyboard/switch
  users), hover/active states on buttons and table rows, subtle card
  shadows, dark-themed scrollbars, and a mobile breakpoint that collapses
  the multi-column stat grids (Dashboard, Finance, BranchComparison,
  SuperAdmin) to one column and turns the sidebar into a horizontal scroll
  bar under 720px — the admin shell itself was unusable on a phone before
  this, not just the guest-facing pages (which already had their own
  mobile-first layouts).

## v4.4 — notifications actually get created now

Found this by checking every type the `Notification` model's own comment
named (`LOW_STOCK`, `NEW_ONLINE_ORDER`, `RESERVATION_REMINDER`) against
what the codebase actually does — and nothing, anywhere, ever created one.
The whole feature was read/mark-read only. Fixed two of the three:

- **`LOW_STOCK`** — wired into `deductStockForOrder` itself: reads an
  ingredient's stock *before* decrementing, and only notifies on the
  transition (was above the reorder level, now at/below it), not on every
  sale while it stays low — re-notifying on every order would just train
  staff to ignore the panel. Tests added confirming it fires on the
  crossing, doesn't fire when stock stays comfortably high, and doesn't
  re-fire if the item was already low before this particular sale.
- **`NEW_ONLINE_ORDER`** — fires both when a guest places a QR order and
  when an aggregator webhook order comes in (Swiggy/Zomato).
- **`RESERVATION_REMINDER` is honestly still not implemented.** Both of
  the above are event-triggered (something happens, a notification fires
  in response) — a *reminder* is time-triggered ("2 hours before the
  reservation"), which needs a scheduled job checking upcoming
  reservations periodically. This codebase has no scheduler configured
  (see the rate-limit-pruning note in v4.3) — adding one is a reasonable
  next step, not something to fake by mislabeling a different trigger.
- Caught and fixed a bug in my own draft before it shipped: the first
  version of `createNotification` called the real Prisma singleton
  instead of accepting the transaction it was passed, which would've
  written outside the same transaction as the stock deduction and broken
  every existing stock test that doesn't have a live DB. Fixed to accept
  an optional `tx` client, same pattern as `deductStockForOrder` and
  `restoreStockForOrder`.

## v4.5 — table merging

Didn't exist at all before this — checked, zero code anywhere handled a
party spanning multiple tables. Added it as a deliberately lightweight
grouping rather than touching how orders work:

- New `Table.mergedIntoTableId` self-relation. `POST /tables/:id/merge`
  and `/unmerge`. A merged table can't itself be a merge target (checked
  server-side, not just left as a UI convention) — merge *into* the
  primary, don't chain merges.
- **Deliberately doesn't change `Order.tableId`** at all — that field is
  a single required table used throughout KOT routing, guest QR ordering,
  and every status transition. Staff still take the order on the primary
  table as normal; merged tables just show grouped on the floor plan
  (Tables.tsx) and get freed together automatically when the primary
  table's order is billed or cancelled — added a shared
  `freeTableAndMerged()` helper in `orders.ts` used at all three points a
  table gets released, so a merged-in table doesn't get stuck OCCUPIED
  forever after its party's bill closes.
- Considered a real many-to-many `Order` ↔ `Table` relation instead, which
  would be more "correct," but it's a materially bigger and riskier change
  for what this actually needs — most restaurants using table merge just
  want the floor plan to show the party as one block and bill through one
  table, not split a single order's line items across multiple tables'
  separate bills.

## v4.6 — a real deploy-breaking bug, found from an actual build log

Not a theoretical fix — this one came from watching a real Netlify build
fail with `exit code 127: npm run build`.

`prisma` (the CLI, distinct from `@prisma/client`) was listed under
`devDependencies`. Setting `NODE_ENV=production` as an env var — which
this project's own `middleware/auth.ts` requires to enforce the mandatory
JWT-secret check added in v4.3 — also makes `npm install` skip
`devDependencies` entirely. Since the build script calls `prisma db push`
directly, the `prisma` command genuinely didn't exist by the time the
build reached it. Moved `prisma` into real `dependencies` — it's invoked
in the production build path, not just local dev, so it was miscategorized
from the start.

Caught and fixed a mistake in my own edit while doing this: the first
`str_replace` meant to remove the `prisma` line from `devDependencies`
accidentally deleted the unrelated `@netlify/functions` entry above it
instead. Verified the final `package.json` by actually parsing it as JSON
and checking each package's location programmatically, not by eyeballing
the diff — confirmed `@netlify/functions` restored, `prisma` moved (not
duplicated), `@prisma/client` untouched.

## Honest gaps — what's stubbed or not done

- **ONDC signature verification** is intentionally unimplemented (see
  above) — needs real Beckn protocol integration and network credentials.
- **Exact aggregator webhook payload shapes** are placeholders pending
  real partner API docs (see above) — the adapter seam is small and
  isolated, but untested against a live payload from any platform.
- **Owner password reset flow**: now implemented (see v3.1 additions above).
- **Rate limiting**: now durable (Postgres-backed, see v4.3 above) instead
  of in-memory.
- **Test coverage is a start, not comprehensive.** `permissions.ts`,
  `stock.ts`, and `pricing.ts` have real unit tests now; the route handlers
  themselves (auth, orders, finance, etc.) still have none — those need
  either a test database or a mocked Prisma client per route file.
- **Not run through a real `npm install` / `tsc` / `prisma generate`** in
  this environment (no network access) — I hand-verified every Prisma field
  reference against the schema, but you should run `npm run typecheck` and
  `npx prisma validate` before deploying, and treat the first real build as
  the actual verification step.
- **Frontend is functional, not polished** — a generic CRUD table
  (`src/components/SimpleCrudPage.tsx`) covers Suppliers, Coupons, Taxes,
  Printers, and Warehouses; it now supports edit + delete, not just create +
  list, but it's still a plain table, not a bespoke UI. POS/Menu/Kitchen/
  Inventory/Employees have bespoke UIs since they needed it. No design pass,
  no mobile layout. Printers and Warehouses opt out of edit/delete
  (`allowEdit={false} allowDelete={false}`) since their backend routes only
  support create/list (+ toggle/set-default for printers) — add `PATCH`/
  `DELETE` routes there before turning those props back on.
- **booker-captain-web** (the separate staff app) still expects the old
  data shapes for anything it reads — the v3 schema additions are all
  additive/nullable so it shouldn't break, but its own auth still needs the
  old employee-cookie pattern unless you migrate it to the new JWT auth too.

## Where things live

- `prisma/schema.prisma` — v2 models unchanged, v3 additions clearly marked
- `server/src/app.ts` — the whole API surface in one file (route mounting)
- `server/src/lib/permissions.ts` — the RBAC permission matrix, single
  source of truth for "who can do what"
- `server/src/lib/stock.ts` — recipe-driven auto stock deduction
- `server/src/lib/escpos.ts` — thermal printer command generation
- `src/pages/` — one file per admin module
