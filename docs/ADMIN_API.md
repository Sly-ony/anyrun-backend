# Anyrun — Admin API Reference

There is no separate `ADMIN` account type. `AccountProfile.adminRole` is a
nullable field — `null` means "not an admin" — set to one of:

| Role | Can do |
|---|---|
| `SUPER_ADMIN` | Everything, including admin management and commission-rate edits |
| `DEVELOPER` | Everything `SUPER_ADMIN` can do **except** admin management and commission-rate edits (can still view rates) |
| `EDITOR` | Blog posts and advert posts only |
| `SUPPORT` | View/suspend users, view/manage disputes only |

This is orthogonal to marketplace `roles` (`AccountType`) — an account can be
an `INDIVIDUAL_CUSTOMER` *and* a `DEVELOPER` at the same time. The permission
matrix lives in `lib/adminPermissions.ts` as named capabilities
(`MANAGE_ADMINS`, `VIEW_COMMISSION_RATES`, `MANAGE_COMMISSION_RATES`,
`MANAGE_CONTENT`, `MANAGE_USERS`, `MANAGE_DISPUTES`, `MANAGE_JOB_CATEGORIES`,
`MANAGE_VERIFICATIONS`); every admin route checks one of these via
`requireAdminCapability`, not the role name directly. `SUPER_ADMIN` is a
blanket bypass in `hasCapability` — it satisfies every capability check.

## Becoming the first admin

**There is no self-service or API way to create the first admin.** It's
bootstrapped directly in the database via `prisma/seed.ts`:
```
ADMIN_EMAIL="you@yourcompany.co.uk" ADMIN_PASSWORD="..." npx prisma db seed
```
This always creates (or promotes an existing account to) **`SUPER_ADMIN`**
specifically — never one of the lesser roles — because it's the only role
that can grant the others. If no account with that email exists, one is
created as a plain `INDIVIDUAL_CUSTOMER` with `adminRole: SUPER_ADMIN`
layered on top.

## Admin management — `/api/admin/admins` *(SUPER_ADMIN only)*

### `POST /api/admin/admins`
Grants `EDITOR`, `SUPPORT`, or `DEVELOPER` to an **existing** account (they
must have already signed up — this doesn't create a user).
```json
{ "email": "newadmin@company.co.uk", "role": "EDITOR" }
```
404 if no account with that email exists yet. 400 if the target is already
a `SUPER_ADMIN` — this endpoint can never change a super admin's role.

### `GET /api/admin/admins`
Lists every account with a non-null `adminRole`.

### `DELETE /api/admin/admins/{accountProfileId}`
Revokes an admin role (sets it back to `null`). 400 if the target is a
`SUPER_ADMIN` (not revocable here) or has no admin role to revoke.

## Verification review — `/api/admin/verifications` *(MANAGE_VERIFICATIONS: SUPER_ADMIN, DEVELOPER)*

Unchanged from before — see "Job categories & verification" in
`USER_API.md` for the submission side.

- `GET /api/admin/verifications` — queue, `?status=PENDING` (default) or `ALL`, `?type=BUSINESS|JOB_CATEGORY`.
- `POST /api/admin/verifications/{id}/review` — `{ "decision": "APPROVED" }` or `{ "decision": "REJECTED", "rejectionReason": "..." }`.

## Job category management — `/api/job-categories` *(MANAGE_JOB_CATEGORIES: SUPER_ADMIN, DEVELOPER)*

Unchanged — `POST`/`PATCH` require the capability; `GET` is public.

## Commission rates — `/api/admin/commission-rates`

Commission rates are now **database-editable**, not just env vars — env vars
(`COMMISSION_RATE_ERRAND` etc., see `lib/commission.ts`) are only the
fallback default for any `sourceType` with no explicit override.

### `GET /api/admin/commission-rates` *(VIEW_COMMISSION_RATES: SUPER_ADMIN, DEVELOPER)*
```json
{ "rates": [
  { "sourceType": "ERRAND", "rate": 0.15, "source": "env_default", "updatedAt": null, "updatedBy": null },
  { "sourceType": "RFQ_QUOTATION", "rate": 0.12, "source": "database_override", "updatedAt": "...", "updatedBy": "..." }
] }
```

### `PATCH /api/admin/commission-rates/{sourceType}` *(MANAGE_COMMISSION_RATES: SUPER_ADMIN only)*
`sourceType` is one of `ERRAND`, `RFQ_QUOTATION`, `CATALOG_PURCHASE`,
`CLEANING_BOOKING`.
```json
{ "rate": 0.12 }
```
`rate` is a fraction (0–1). This is the one capability `DEVELOPER`
explicitly cannot use — it can `GET` but a `PATCH` attempt returns 403.

## Content — blog & adverts *(MANAGE_CONTENT: SUPER_ADMIN, DEVELOPER, EDITOR)*

### `POST /api/blog`
```json
{
  "title": "How Anyrun's commission works",
  "slug": "how-anyruns-commission-works",
  "content": "...",
  "coverImageUrl": "https://...", // optional
  "status": "DRAFT" // or "PUBLISHED" — defaults to DRAFT
}
```
409 if the slug is taken. `publishedAt` is set automatically when `status: "PUBLISHED"`.

### `GET /api/blog` *(public)*
Published posts, paginated. Pass `?status=DRAFT` to see drafts — requires
`MANAGE_CONTENT` (403 otherwise).

### `GET /api/blog/{id}` *(public)* / `GET /api/blog/slug/{slug}` *(public, published only)*
Detail by id (any status) or by slug (published only — 404 for an
unpublished slug, so drafts aren't guessable via the public reading URL).

### `DELETE /api/blog/{id}`
Hard delete.

### `POST /api/adverts`
```json
{
  "title": "Autumn delivery promo",
  "imageUrl": "https://...",
  "linkUrl": "https://...", // optional
  "placement": "home_banner", // optional, free text — no fixed taxonomy yet
  "startDate": "2026-10-01T00:00:00Z", // optional
  "endDate": "2026-10-31T23:59:59Z",   // optional
  "isActive": true // optional, defaults true
}
```

### `GET /api/adverts` *(public)*
Only adverts that are `isActive: true` **and** currently within
`startDate`/`endDate` (either bound being unset means no limit on that side).

### `DELETE /api/adverts/{id}`
Hard delete.

## Users — `/api/admin/users` *(MANAGE_USERS: SUPER_ADMIN, DEVELOPER, SUPPORT)*

### `GET /api/admin/users`
Full (unredacted) list, unlike the public `GET /api/accounts/{id}`. Filters:
`?suspended=true`, `?email=partial-match`.

### `GET /api/admin/users/{id}`
Full detail for one account (`{id}` is the `AccountProfile.id`).

### `POST /api/admin/users/{id}/suspend`
```json
{ "reason": "Repeated no-shows on accepted errands" }
```
Sets `isActive: false` plus `suspensionReason`/`suspendedAt`/`suspendedBy`.
**This immediately locks the account out of every authenticated endpoint**
(`requireAuth` checks `isActive` on every request) — there's no partial
suspension. 400 if the target is itself an admin (admins aren't suspendable
through this endpoint — demote them via `/api/admin/admins` first if truly
necessary). 409 if already suspended. The user gets an `ACCOUNT_SUSPENDED`
notification recorded (they won't be able to fetch it until reinstated,
since fetching requires a valid session — it's there for the record either
way).

### `POST /api/admin/users/{id}/reinstate`
Clears the suspension fields and sets `isActive: true` again. 409 if not
currently suspended.

## Disputes — `/api/disputes`

Raising a dispute is open to **any authenticated account** — this isn't
admin-only, it's how a user escalates a problem. Managing one is
admin-only.

### `POST /api/disputes` *(any authenticated account)*
```json
{
  "relatedType": "ERRAND", // ERRAND | RFQ | CATALOG_ORDER | CLEANING_BOOKING | DELIVERY_JOB | OTHER
  "relatedId": "...", // optional — the id of the Order/ErrandRequest/etc., loosely referenced, not an enforced relation
  "againstId": "...", // optional — the other party's AccountProfile.id, if there is one
  "subject": "Runner never showed up",
  "description": "..."
}
```
201, status `OPEN`.

### `GET /api/disputes`
Without `MANAGE_DISPUTES`: only disputes you raised. With it (`SUPPORT`,
`DEVELOPER`, `SUPER_ADMIN`): every dispute. `?status=` filters either way.

### `GET /api/disputes/{id}`
The raiser, the named `againstId` party, or an admin with `MANAGE_DISPUTES`.

### `POST /api/disputes/{id}/manage` *(MANAGE_DISPUTES: SUPER_ADMIN, DEVELOPER, SUPPORT)*
```json
{ "status": "IN_REVIEW" }
```
or, to close it out:
```json
{ "status": "RESOLVED", "resolutionNotes": "Refunded via manual adjustment", "assignedToId": "..." }
```
`resolutionNotes` is required when moving to `RESOLVED` or `DISMISSED`
(both are terminal — 409 to manage an already-terminal dispute). The raiser
gets a `DISPUTE_UPDATE` notification on every transition.

## Designating the cleaning provider — `prisma/seed.ts`

Unchanged: the single `CLEANING_PROVIDER` account is still created once,
directly in the database (env vars `CLEANING_PROVIDER_EMAIL`/`_PASSWORD`/
`_NAME`/`_PHONE`), idempotently. Still no runtime endpoint for this — same
reasoning as always: it's the founder's own company and essentially never
changes.

## Remaining known gaps

- No platform-wide analytics/dashboard (revenue totals, user counts over
  time) — everything above is record-level (list/detail/action), not
  aggregated reporting.
- `Dispute.relatedId` is a loose, unenforced reference (same pattern as
  `DeliveryJob.relatedOrderId`) — fetching the actual related record is a
  manual follow-up lookup by the admin, not joined automatically.
- No audit log beyond what each model records on itself (`reviewedBy`,
  `suspendedBy`, `updatedBy` on commission rates, etc.) — there's no unified
  "admin action history" view across all of these.
- `AdvertPost.placement` is free text with no fixed taxonomy — fine for one
  admin curating it by hand, worth an enum if placements multiply.
