# Anyrun — Backend API

Next.js (App Router) + Prisma + MongoDB backend for Anyrun: an errand,
procurement (RFQ) and delivery marketplace, plus a single reserved cleaning
services vertical.

## Setup

1. Install dependencies:
   ```
   npm install next react react-dom @prisma/client zod jsonwebtoken bcryptjs
   npm install -D prisma typescript @types/node @types/react @types/jsonwebtoken @types/bcryptjs tsx
   ```
2. Copy `.env.example` to `.env` and fill in real values.
3. Generate the Prisma client and push the schema to your MongoDB replica set:
   ```
   npx prisma generate
   npx prisma db push
   ```
4. Seed the single reserved cleaning-provider account, and optionally
   bootstrap the first platform admin (see `docs/ADMIN_API.md`):
   ```
   npx prisma db seed
   ```
   (requires `"prisma": { "seed": "tsx prisma/seed.ts" }` in `package.json`)
5. Run the app:
   ```
   npm run dev
   ```

## Notes

- **MongoDB must be a replica set** — Prisma's `$transaction` (used
  throughout for multi-document writes like signup and order/payment
  creation) requires it.
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
prisma/
  schema.prisma       MongoDB data model
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
  admin/
    admins/           SUPER_ADMIN grants/revokes EDITOR, SUPPORT, DEVELOPER
    commission-rates/ View (SUPER_ADMIN, DEVELOPER) / edit (SUPER_ADMIN only)
    users/            View all / suspend / reinstate (SUPPORT+)
    verifications/    Review queue + approve/reject (SUPER_ADMIN, DEVELOPER)
```

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
