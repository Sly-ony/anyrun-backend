# Anyrun — User API Reference

This document covers every endpoint a regular Anyrun account (individual
customer, runner, business buyer, business supplier, or the seeded cleaning
provider) can call. There is no separate "admin" API — see `ADMIN_API.md`
for the one administrative operation this project has today.

## Conventions

**Base URL**: relative to wherever the Next.js app is deployed, e.g.
`https://api.anyrun.co.uk/api/...`

**Authentication**: sign up or log in to receive a session. The session is
set as an httpOnly cookie automatically; for mobile/native clients, send it
instead as `Authorization: Bearer <token>` (the `token` returned in the
sign-up/login response body). Every endpoint below except sign-up, login,
public catalog browsing, and public account lookup requires a valid session.

**Errors**: every error response has the shape:
```json
{ "error": "Human-readable message." }
```
with an appropriate HTTP status code (400 validation, 401 not logged in, 403
not permitted, 404 not found, 409 conflict/invalid state transition, 402
payment failed, 500 unexpected).

**Pagination**: any list endpoint accepts `?page=1&pageSize=20` (default
page size 20, max 100) and responds with:
```json
{ "items": [...], "page": 1, "pageSize": 20, "total": 137 }
```

**Location shape**, used throughout (errand/RFQ/catalog locations, service
regions, addresses):
```json
{
  "country": "United Kingdom",
  "state": "Greater London",
  "city": "London",
  "area": "Shoreditch",
  "postalCode": "E1 6AN",
  "latitude": 51.5074,
  "longitude": -0.1278
}
```
`country`, `state`, and `city` are required; everything else is optional.
`state` means whatever a country calls its top-level administrative region
(a UK county/region, a Nigerian state, etc.) — the field name is generic.
Region-based **search/browse** matches on `state` + `city`; region-based
**notifications** match on `state` alone (broader net, so you don't miss an
opportunity over a city-name mismatch).

## Job categories & verification

Two independent verification tracks exist:

- **Business verification** — proves an account registered with a
  business-side role (`BUSINESS_BUYER` or `BUSINESS_SUPPLIER` — this is what
  determines `accountKind = BUSINESS`, derived automatically from your
  `roles` at sign-up, not a separate question) is a real business. Required
  before you can post an RFQ or list a catalog item.
- **Job-category verification** — proves a `RUNNER` is eligible for a
  specific *kind* of job (e.g. anything involving valuables or vulnerable
  people). Required before accepting an errand whose category matches a
  verification-gated `JobCategory`.

### `GET /api/job-categories` *(public)*
The list an individual sees when choosing "get a job":
```json
{ "categories": [
  { "id": "...", "name": "Furniture moving", "requiresVerification": true, "description": "..." },
  { "id": "...", "name": "Grocery pickup", "requiresVerification": false }
] }
```

### `POST /api/account/job-categories`
`RUNNER`-only. Selects which categories you want to work in. **For every
selected category that requires verification, you must supply documents in
this same call** — selecting two verification-gated categories means
submitting proof for both, not one at a time.
```json
{
  "jobCategoryIds": ["cat_id_1", "cat_id_2"],
  "verificationDocuments": {
    "cat_id_1": ["https://.../id-front.jpg", "https://.../id-back.jpg"],
    "cat_id_2": ["https://.../certificate.pdf"]
  }
}
```
400 if any selected category needing verification has no documents supplied.
Returns each category's resulting verification status (existing
`APPROVED`/`PENDING` submissions aren't duplicated; a previous `REJECTED`
one is resubmitted). Selecting categories again later fully replaces your
previous `jobCategoryIds` list.

### `GET /api/account/job-categories`
Your currently-selected categories plus your verification records for them.

### `POST /api/account/business-verification`
Only for `accountKind = BUSINESS` accounts.
```json
{ "documents": ["https://.../certificate-of-incorporation.pdf"], "notes": "optional" }
```
409 if already verified or already pending. A prior rejection can be
resubmitted.

### `GET /api/verifications`
Your own verification submissions (business + job-category), newest first.

### `GET /api/verifications/{id}`
Detail — you, or a platform admin, only.

### Enforcement points
- `POST /api/rfqs` and `POST /api/catalog` both return 403 if your business
  isn't `APPROVED`-verified yet.
- `POST /api/errands/{id}/accept` returns 403 if the errand's `category`
  (free text) matches a `JobCategory` with `requiresVerification: true` and
  you don't hold an `APPROVED` verification for it. An errand category with
  no matching `JobCategory` entry is never gated — verification only applies
  to categories the founder has explicitly curated.

---



### `POST /api/auth/signup`
Create a User + AccountProfile together.

```json
{
  "email": "jane@example.co.uk",
  "phone": "+447700900000",         // optional
  "password": "at-least-8-chars",
  "name": "Jane Doe",
  "roles": ["INDIVIDUAL_CUSTOMER"], // one or more of: INDIVIDUAL_CUSTOMER, RUNNER, BUSINESS_BUYER, BUSINESS_SUPPLIER
  "businessName": "Jane's Deliveries", // required if roles includes BUSINESS_BUYER or BUSINESS_SUPPLIER
  "serviceRegions": [ /* Location[] */ ] // required if roles includes RUNNER or BUSINESS_SUPPLIER
}
```
- `CLEANING_PROVIDER` cannot be selected here — that account is seeded once, directly in the database (see `ADMIN_API.md`).
- 201 → `{ "user": {...}, "profile": {...}, "token": "..." }`, session cookie set.
- 409 if the email or phone is already in use.

### `POST /api/auth/login`
```json
{ "email": "jane@example.co.uk", "password": "..." }
```
200 → same shape as signup. 401 for wrong credentials or an OAuth-only account with no password.

### `POST /api/auth/logout`
No body. Clears the session cookie. 200 → `{ "success": true }`.

### `GET /api/auth/me`
Returns the caller's current `{ "user": {...}, "profile": {...} }`.

---

## Account — `/api/account`, `/api/accounts`

### `PATCH /api/account`
Update your own profile.
```json
{
  "name": "Jane Doe",
  "avatarUrl": "https://...",
  "phone": "+447700900001",
  "businessName": "New Name Ltd",
  "serviceRegions": [ /* Location[] */ ]
}
```
All fields optional; send only what you're changing. 409 if the phone is already taken by another account.

### `GET /api/accounts/{id}` *(public — no auth required)*
Public-safe view of any active account:
```json
{
  "account": {
    "id": "...",
    "name": "...",
    "avatarUrl": "...",
    "roles": ["BUSINESS_SUPPLIER"],
    "businessName": "...",
    "serviceRegions": [{ "country": "...", "state": "...", "city": "..." }],
    "createdAt": "..."
  }
}
```
Note `serviceRegions` here is stripped down to country/state/city only — no postcode or coordinates.

---

## Errands — `/api/errands` (flow A: "go get this for me")

Who can post one: `INDIVIDUAL_CUSTOMER` or `BUSINESS_BUYER`.

### `POST /api/errands`
```json
{
  "description": "Pick up a parcel from the post office and drop it at my flat",
  "category": "delivery",
  "location": { /* Location */ },
  "budget": 15.00,           // optional
  "photos": ["https://..."], // optional
  "deadline": "2026-10-01T17:00:00Z" // optional
}
```
201 → `{ "errand": {...} }`, status `OPEN`. Region-matched runners are notified.

### `GET /api/errands`
Query params:
- `mine=true` — your own posted errands (any status)
- `assignedToMe=true` — errands assigned to you (requires `RUNNER` role)
- neither — the open browse feed: `status=OPEN`, region-scoped to your `serviceRegions` if you're a runner
- `category`, `status` — additive filters on top of any of the above

### `GET /api/errands/{id}`
Detail view. Any authenticated account may view it.

### `PATCH /api/errands/{id}`
Same fields as create, all optional. Customer-only, and only while `status = OPEN`.

### `DELETE /api/errands/{id}`
Customer-only cancel (sets `status = CANCELLED`), only while `OPEN`. Once a
runner is attached, use the status endpoint instead.

### `POST /api/errands/{id}/accept`
Runner-only. Claims an `OPEN`, unassigned errand → `ACCEPTED`, sets you as
the runner. Race-safe (409 if someone else just took it). 403 if the
errand's category requires job-category verification you don't yet hold
(see "Job categories & verification" above).

### `POST /api/errands/{id}/status`
```json
{ "status": "IN_PROGRESS" }
```
Allowed transitions and who can make them:

| From | To | Actor |
|---|---|---|
| OPEN | CANCELLED | customer |
| ACCEPTED | IN_PROGRESS | runner |
| ACCEPTED | CANCELLED | customer or runner |
| IN_PROGRESS | DELIVERED | runner |
| IN_PROGRESS | CANCELLED | customer |
| DELIVERED | COMPLETED | customer |

### `POST /api/errands/{id}/pay`
Customer-only, only once `status = COMPLETED`.
```json
{ "amount": 15.00 }
```
There's no stored "agreed price" field — the errand model doesn't negotiate
in-app, so state the final amount you and the runner settled on. Creates an
`OrderTx` (commission deducted per `COMMISSION_RATE_ERRAND`) and charges it.
201 → `{ "order": {...}, "payment": {...} }`. 409 if already paid.

---

## RFQs & Quotations — `/api/rfqs`, `/api/quotations` (flow B: procurement)

Who can post an RFQ: `BUSINESS_BUYER`. Who can quote: `BUSINESS_SUPPLIER`.

### `POST /api/rfqs`
Requires an `APPROVED` business verification (see "Job categories &
verification" above) — 403 otherwise.
```json
{
  "title": "Furnishing a 3-bed flat",  // optional
  "lineItems": [
    { "name": "Fridge freezer", "quantity": 1, "notes": "American style" },
    { "name": "Sofa", "quantity": 1 }
  ],
  "region": { /* Location */ },
  "deadline": "2026-10-15T00:00:00Z" // optional
}
```
201 → `{ "rfq": {...} }`, status `OPEN`, each line item gets a server-generated `itemId`. Region-matched suppliers are notified.

### `GET /api/rfqs`
`mine=true` for your own; otherwise the open, region-scoped browse feed for suppliers. `status` filter available either way.

### `GET /api/rfqs/{id}`
Returns `{ "rfq": {...}, "quotations": [...] }`. The buyer sees every
quotation; a supplier sees only their own; anyone else gets an empty list.

### `PATCH /api/rfqs/{id}`
Buyer-only, only while `OPEN`. Same fields as create; replacing `lineItems`
regenerates their `itemId`s (existing ones are preserved by position where possible).

### `DELETE /api/rfqs/{id}` / `POST /api/rfqs/{id}/close`
Both do the same thing: buyer-only, `OPEN → CLOSED`, no award. `DELETE` is
semantic REST; `/close` is there if your client prefers an action verb.

### `POST /api/rfqs/{id}/quotations`
Supplier-only, only while the RFQ is `OPEN`; one live (`SUBMITTED`) quotation per supplier per RFQ.
```json
{
  "lineItems": [
    { "rfqItemId": "<from the RFQ's lineItems>", "name": "Fridge freezer", "price": 450.00 }
  ],
  "totalPrice": 450.00, // optional — computed as the sum of line prices if omitted
  "notes": "Can deliver within 5 days"
}
```
201 → `{ "quotation": {...} }`. The buyer is notified.

### `GET /api/rfqs/{id}/quotations`
Buyer sees all; supplier sees only their own.

### `GET /api/quotations/{id}` / `PATCH` / `DELETE`
Detail, edit, or withdraw a single quotation. Edit/withdraw are
supplier-only, and only while the quotation is `SUBMITTED` and its RFQ is
still `OPEN`. `DELETE` is a hard delete (there's no `WITHDRAWN` status in the
schema).

### `POST /api/rfqs/{id}/award`
Buyer-only, only while the RFQ is `OPEN`.
```json
{ "quotationIds": ["quotationId1", "quotationId2"] }
```
Marks the listed quotations `ACCEPTED` and every other `SUBMITTED` one on
that RFQ `REJECTED`; RFQ → `AWARDED`. All named suppliers are notified of the
outcome. *Note*: if you award more than one quotation, only the first is
stored on `RFQ.awardedQuotationId` — `Quotation.status = ACCEPTED` is the
authoritative list of every winner.

### `POST /api/quotations/{id}/pay`
Buyer-only, only for an `ACCEPTED` quotation. Charges `quotation.totalPrice`
(commission per `COMMISSION_RATE_RFQ`) to the supplier. 201 →
`{ "order": {...}, "payment": {...} }`. 409 if already paid.

---

## Catalog — `/api/catalog` (flow C: browse & buy)

Browsing is **public** — no login required. Listing/editing requires
`BUSINESS_SUPPLIER` and ownership.

### `POST /api/catalog`
Requires an `APPROVED` business verification (see "Job categories &
verification" above) — 403 otherwise.
```json
{
  "title": "IKEA-style 3-seater sofa",
  "description": "Grey fabric, barely used", // optional
  "category": "furniture",
  "price": 250.00,
  "currency": "GBP",       // optional, defaults to GBP
  "photos": ["https://..."], // optional
  "region": { /* Location */ },
  "isAvailable": true      // optional, defaults to true
}
```
400 if `category` is (or contains) "cleaning", "cleaner", or "housekeeping"
— that vertical is exclusive to the seeded cleaning provider (see
`ADMIN_API.md`).

### `GET /api/catalog`
Query params: `category`, `state`, `city`, `q` (free-text title/description
search), `minPrice`, `maxPrice`, `supplierId`. Only `isAvailable: true` items
are returned unless you pass `mine=true` (requires auth + `BUSINESS_SUPPLIER`,
returns all your own listings including hidden ones).

### `GET /api/catalog/{id}` *(public)*
Single item detail.

### `PATCH /api/catalog/{id}` / `DELETE /api/catalog/{id}`
Owner-only. `DELETE` is a soft-remove (`isAvailable: false`) so past orders
keep a valid reference.

### `POST /api/catalog/{id}/purchase`
```json
{ "quantity": 1 } // optional, defaults to 1
```
Creates **and immediately charges** an order (no separate acceptance step,
unlike errands/RFQs) — commission per `COMMISSION_RATE_CATALOG`. 201 →
`{ "order": {...}, "payment": {...} }`.

---

## Cleaning bookings — `/api/cleaning-bookings`

Any authenticated account can book — individual or business. The provider is
always the one seeded `CLEANING_PROVIDER` account; you never choose it.

### `POST /api/cleaning-bookings`
```json
{
  "serviceScope": "DOMESTIC", // or "COMMERCIAL"
  "address": { /* Location */ },
  "scheduledDate": "2026-10-05T09:00:00Z",
  "notes": "Two bedrooms, one bathroom", // optional
  "price": 60.00 // optional — the provider can set/confirm this instead
}
```
201 → `{ "booking": {...} }`, status `PENDING`. The provider is notified.

### `GET /api/cleaning-bookings`
`asProvider=true` if you *are* the cleaning provider, to see your incoming
queue; otherwise your own bookings as customer.

### `GET /api/cleaning-bookings/{id}` / `PATCH`
Detail (customer or provider). Edit is customer-only, only while `PENDING`
(`address`, `scheduledDate`, `notes`).

### `POST /api/cleaning-bookings/{id}/status`
```json
{ "status": "CONFIRMED", "price": 60.00 }
```
`price` is required the first time the booking moves to `CONFIRMED` if none
was set at booking time. Transitions:

| From | To | Actor |
|---|---|---|
| PENDING | CONFIRMED | provider |
| PENDING | CANCELLED | customer |
| CONFIRMED | IN_PROGRESS | provider |
| CONFIRMED | CANCELLED | customer or provider |
| IN_PROGRESS | COMPLETED | provider |

### `POST /api/cleaning-bookings/{id}/pay`
Customer-only, only once `status = COMPLETED` and a price is set. Commission
per `COMMISSION_RATE_CLEANING`. 201 → `{ "order": {...}, "payment": {...} }`.

---

## Delivery jobs — `/api/delivery-jobs` (founder's own logistics arm)

Linked to *either* an errand you posted or a procurement order you paid for
— never both.

### `POST /api/delivery-jobs`
```json
{
  "errandRequestId": "...",   // exactly one of these two
  "relatedOrderId": "...",
  "pickupAddress": { /* Location */ },
  "dropoffAddress": { /* Location */ },
  "deliveryFee": 8.50,
  "scheduledAt": "2026-10-02T10:00:00Z" // optional
}
```
If linking to an order, it must already be `PAID`. 201 → `{ "job": {...} }`, status `REQUESTED`.

### `GET /api/delivery-jobs`
`assignedToMe=true` (requires `RUNNER`) for jobs assigned to you; otherwise
jobs you requested (derived from your errands/orders).

### `GET /api/delivery-jobs/{id}`
Requester or assignee only. Returns `{ "job": {...}, "payment": {...} }` —
`payment` is `null` until paid (this is the one payment record not reachable
via `/api/orders`, since delivery fees carry no commission and never become
an `OrderTx`).

### `POST /api/delivery-jobs/{id}/assign`
`RUNNER`-only self-claim of an unassigned `REQUESTED` job (same pattern as
errand acceptance — there's no dispatch system yet, see `ADMIN_API.md`).
Notifies the requester.

### `POST /api/delivery-jobs/{id}/status`
```json
{ "status": "PICKED_UP" }
```
| From | To | Actor |
|---|---|---|
| REQUESTED | CANCELLED | requester |
| ASSIGNED | PICKED_UP | assignee |
| ASSIGNED | CANCELLED | requester |
| PICKED_UP | IN_TRANSIT | assignee |
| IN_TRANSIT | DELIVERED | assignee |

Notifies whichever party didn't make the change.

### `POST /api/delivery-jobs/{id}/pay`
Requester-only, requires an assignee. No commission — the full
`deliveryFee` goes to the assignee. 201 → `{ "payment": {...} }`.

---

## Orders — `/api/orders` (transaction history, read-only)

Every `.../pay` endpoint above creates one of these under the hood.

### `GET /api/orders`
`?role=payer` or `?role=payee` to filter; omit for both.

### `GET /api/orders/{id}`
Payer or payee only. Returns `{ "order": {...}, "payment": {...} }`.

`OrderTx.sourceType` is one of `ERRAND`, `RFQ_QUOTATION`, `CATALOG_PURCHASE`,
`CLEANING_BOOKING`. `commissionAmount` is what the platform kept;
`amount - commissionAmount` is what the payee actually received.

---

## Blog & adverts — `/api/blog`, `/api/adverts` *(public reading)*

Content is written by admins (`EDITOR`/`DEVELOPER`/`SUPER_ADMIN` — see
`ADMIN_API.md`), but reading is open to everyone, no login required.

### `GET /api/blog`
Published posts, paginated, newest first.

### `GET /api/blog/{id}` / `GET /api/blog/slug/{slug}`
Post detail, by id or by its URL slug. The slug route 404s for anything not
`PUBLISHED` (so an unpublished slug can't be guessed at).

### `GET /api/adverts`
Currently-active adverts only (`isActive: true` and within any configured
`startDate`/`endDate` window).

---

## Disputes — `/api/disputes`

Any authenticated account can raise one — this is how you escalate a
problem with an errand, RFQ, order, delivery, or cleaning booking.

### `POST /api/disputes`
```json
{
  "relatedType": "ERRAND", // ERRAND | RFQ | CATALOG_ORDER | CLEANING_BOOKING | DELIVERY_JOB | OTHER
  "relatedId": "...",      // optional — id of the specific record
  "againstId": "...",      // optional — the other party's account id, if there is one
  "subject": "Runner never showed up",
  "description": "Agreed pickup time was 2pm, no contact since."
}
```
201 → `{ "dispute": {...} }`, status `OPEN`.

### `GET /api/disputes`
Your own disputes (admins with dispute-management access see everything —
see `ADMIN_API.md`). `?status=` filters.

### `GET /api/disputes/{id}`
You (as the raiser or the named other party), or an admin.

You'll get a `DISPUTE_UPDATE` notification whenever its status changes.

---

## Notifications — `/api/notifications`

### `GET /api/notifications`
`?unreadOnly=true` optional. Response includes an `unreadCount` alongside the paginated list.

### `POST /api/notifications/{id}/read`
Marks one notification read.

### `POST /api/notifications/read-all`
Marks every one of your unread notifications read. → `{ "updatedCount": n }`.

`NotificationType` values: `NEW_ERRAND_REQUEST`, `NEW_RFQ`,
`QUOTATION_RECEIVED`, `QUOTATION_ACCEPTED`, `ORDER_PAID`, `DELIVERY_UPDATE`,
`CLEANING_BOOKING_UPDATE`, `VERIFICATION_UPDATE`, `DISPUTE_UPDATE`,
`ACCOUNT_SUSPENDED`, `GENERAL` (used for "your quotation wasn't selected").
