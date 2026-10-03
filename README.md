# Anyrun — Backend API

Next.js (App Router) + Prisma + PostgreSQL (Supabase) backend for Anyrun: an
errand, procurement (RFQ) and delivery marketplace, plus a single reserved
cleaning services vertical.

**Migrated from MongoDB.** If you're looking at an older checkout that still
has `provider = "mongodb"` in `prisma/schema.prisma`, `@db.ObjectId`
attributes, or a `type Location { ... }` composite type block, that's the
pre-migration version — see "What changed in the Postgres migration" below.

## Setup

1. Install dependencies:
   ```
   npm install next react react-dom @prisma/client zod jsonwebtoken bcryptjs pg dotenv
   npm install -D prisma @prisma/adapter-pg typescript @types/node @types/react @types/jsonwebtoken @types/bcryptjs @types/pg tsx
   ```
2. Create a Supabase project, then copy `.env.example` to `.env` and fill in
   **both** `DATABASE_URL` (pooled, port 6543) and `DIRECT_URL` (direct, port
   5432) from Supabase's Database settings — the project uses the direct URL
   for migrations/seeding and the pooled one at runtime (see
   `prisma.config.ts` and `lib/prisma.ts`).
3. Generate the Prisma client and run migrations:
   ```
   npx prisma generate
   npx prisma migrate dev --name init
   ```
4. Seed the single reserved cleaning-provider account, and optionally
   bootstrap the first platform admin (see `docs/ADMIN_API.md`):
   ```
   npx prisma db seed
   ```
   This project uses the new `prisma.config.ts` (not a `package.json`
   `"prisma"` key) to point `db seed` at `tsx prisma/seed.ts`.
5. Run the app:
   ```
   npm run dev
   ```

## What changed in the Postgres migration

- **IDs**: every model's `id` is now `@default(cuid())`, not a Mongo
  ObjectId. No more `@map("_id")` or `@db.ObjectId` anywhere — those were
  Mongo-only attributes.
- **No composite types**: Postgres has no equivalent to Prisma's Mongo-only
  "composite type" embeds. Every field that used to be a `Location`,
  `RFQLineItem`, or `QuotationLineItem` composite (`ErrandRequest.location`,
  `RFQ.region`/`lineItems`, `Quotation.lineItems`, `CatalogItem.region`,
  `CleaningBooking.address`, `DeliveryJob.pickupAddress`/`dropoffAddress`,
  `AccountProfile.serviceRegions`) is now a plain `Json` column holding the
  same shape. Prisma Client reads these back as untyped `JsonValue` rather
  than a typed embedded object — `lib/json.ts` has the casting helpers
  (`asLocation`, `asLocationArray`, `asRFQLineItems`, `asQuotationLineItems`)
  used everywhere one of these fields is read with property access.
- **Region matching changed shape**: Mongo could filter "does this
  composite-type list contain an entry matching X" at the database level.
  Postgres/Prisma's Json filtering only supports extracting a path from a
  *single* JSON document, not iterating array elements — so matching a
  single `Location` field (e.g. "errands in this city") still happens in
  the database (`lib/region.ts`'s `anyRegionMatch`, via `{ path: [...],
  equals: ... }`), but matching against `serviceRegions` (an *array* of
  `Location`s) now fetches candidates by role and filters in memory
  (`matchesAnyState`, used in `lib/notificationService.ts`). Fine at the
  scale this matters (number of active runners/suppliers), but would want a
  proper join table if that scale assumption changes.
- **Next.js 15 dynamic route params**: unrelated to the database, but fixed
  in the same pass since it was breaking `npm run build` — every
  `app/api/.../[x]/route.ts` handler now receives `params` as a `Promise`
  and awaits it, per Next.js 15's breaking change to the App Router API.

## Health & deployment check

Two unauthenticated routes exist purely to confirm the API is up before/after
deploying — point your host's uptime monitor or load balancer health check
at the second one:

- **`GET /api`** — friendly welcome response, no database dependency. Confirms
  the server is running and routing requests at all.
- **`GET /api/health`** — pings Postgres via Prisma and returns `200` with
  `{ "status": "ok", "database": { "status": "connected", "latencyMs": N } }`
  if it succeeds, or `503` with `{ "status": "error", "database": { "status": "disconnected" }, "hint": "..." }`
  if the database isn't reachable. A bad `DATABASE_URL` is the most common
  first-deploy mistake and otherwise fails silently (every other route just
  500s with no obvious cause) — this route exists to catch that immediately.

## Notes

- **Runtime vs. migration connections**: the app connects to Supabase through
  the pooled pgbouncer URL (`DATABASE_URL`) via `@prisma/adapter-pg`;
  `prisma migrate`/`db seed` use the direct URL (`DIRECT_URL`) instead,
  since pgbouncer's transaction-pooling mode can't run DDL. Both must be set.
- **Payments are mocked** (`lib/paymentProvider.ts`) — swap that one file for
  a real gateway (e.g. Stripe, GoCardless) when ready; nothing else needs to
  change.
- **Commission rates are placeholders**, read from env vars — see
  `lib/commission.ts`.
- See `docs/USER_API.md` for the full API reference, and `docs/ADMIN_API.md`
  for the one administrative operation this project currently has (seeding
  the cleaning provider) and what's still missing for broader admin needs.

## Project structure

```
prisma.config.ts      Schema path, migrations, db-seed command, datasource URL
prisma/
  schema.prisma       PostgreSQL data model (Supabase)
  seed.ts             Creates the single reserved CLEANING_PROVIDER account
lib/
  *.ts                Shared services: auth/session, guards, region matching,
                       commission calculation, mock payments, notifications,
                       state machines, validation schemas
app/api/
  auth/               Sign up, log in, log out, current session
  account/            Update the caller's own profile, job-category selection, business verification
  accounts/[id]/      Public view of another account
  job-categories/     Curated job list + verification requirement (public read, admin write)
  verifications/      The caller's own verification submissions
  errands/            Errand ("go get this for me") flow
  rfqs/, quotations/  B2B procurement flow
  catalog/            Supplier catalog + region search
  delivery-jobs/      Founder's own logistics/delivery arm
  cleaning-bookings/  Exclusive cleaning vertical
  orders/             Transaction/payment history
  notifications/      In-app notifications
  blog/, adverts/     Admin-authored content (public read, EDITOR+ write)
  disputes/           Raise (any user) / manage (SUPPORT+) disputes
  wallet/             Balance, ledger, deposits, withdrawals (Paystack/Flutterwave)
  webhooks/           Public gateway callbacks: paystack/, flutterwave/
  admin/
    admins/           SUPER_ADMIN grants/revokes EDITOR, SUPPORT, DEVELOPER
    commission-rates/ View (SUPER_ADMIN, DEVELOPER) / edit (SUPER_ADMIN only)
    users/            View all / suspend / reinstate (SUPPORT+)
    verifications/    Review queue + approve/reject (SUPER_ADMIN, DEVELOPER)
    errands/, orders/, revenue/, deposits/, withdrawals/  Read-only platform-wide views (VIEW_PLATFORM_DATA)
```

## Wallet & payments (Paystack / Flutterwave)

Every account has a GBP wallet balance, funded by deposits and by earnings
auto-credited when an errand/RFQ/catalog/cleaning/delivery payment succeeds.
Full reference in `docs/USER_API.md` section 13 ("Wallet").

**Before deploying with real money movement:**
- `lib/payments/paystack.ts` and `lib/payments/flutterwave.ts` are real REST
  integrations against each gateway's public API, not mocks — but verify
  field names against current docs (gateway APIs change) before going live.
- **Paystack does not support GBP settlement or UK bank payouts** as far as
  its public documentation goes (NGN/GHS/ZAR/KES only) — confirm with
  Paystack directly what your specific merchant account supports before
  relying on it for this business.
- Configure `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`,
  `FLUTTERWAVE_WEBHOOK_HASH`, and `WALLET_DEPOSIT_CALLBACK_URL` (see
  `.env.example`), and point each gateway's dashboard webhook config at
  `/api/webhooks/paystack` and `/api/webhooks/flutterwave` respectively.
- The errand/RFQ/catalog/cleaning `.../pay` endpoints still use the
  separate **mocked** `lib/paymentProvider.ts` — they are not yet wired to
  the real gateways or to spending from the wallet. Only deposits and
  withdrawals use Paystack/Flutterwave for real. See `docs/USER_API.md`
  section 13 for the full explanation of that boundary.

## Admin role hierarchy

`AccountProfile.adminRole` (nullable) is `SUPER_ADMIN`, `EDITOR`, `SUPPORT`,
or `DEVELOPER` — orthogonal to the marketplace `roles` field. Full
capability matrix and bootstrap instructions in `docs/ADMIN_API.md`; the
short version:
- **SUPER_ADMIN**: everything, including granting other admins and editing
  commission rates. Bootstrapped once via `prisma/seed.ts` — never via the API.
- **DEVELOPER**: everything SUPER_ADMIN can do *except* admin management and
  commission-rate edits (can still view rates).
- **EDITOR**: blog + advert posts only.
- **SUPPORT**: view/suspend users, view/manage disputes only.
