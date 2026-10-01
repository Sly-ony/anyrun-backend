# Anyrun — User API Reference (full request/response bodies)

Every endpoint a regular Anyrun account (individual customer, runner,
business buyer, business supplier, or the seeded cleaning provider) can
call, with the exact JSON each one expects and returns. For the admin-only
layer (content, users, disputes, commission rates, admin roles) see
`ADMIN_API.md`.

## Conventions used throughout this document

**Base URL**: relative to wherever the app is deployed, e.g.
`https://api.anyrun.co.uk/api/...`

**Auth header**: unless marked *(public)*, every endpoint requires a valid
session — `Authorization: Bearer <token>` (the `token` from signup/login) or
the `anyrun_session` httpOnly cookie set automatically by signup/login.
Omit it → `401`:
```json
{ "error": "Authentication required." }
```

**Errors**: every error response has the shape `{ "error": "message" }` with
an appropriate status code — `400` validation, `401` not authenticated,
`403` not permitted, `404` not found, `409` conflict/invalid state
transition, `402` payment failed, `500` unexpected.

**Pagination** (list endpoints): query params `?page=1&pageSize=20` (default
page size 20, max 100), response shape:
```json
{ "items": [ /* ... */ ], "page": 1, "pageSize": 20, "total": 42 }
```

**IDs** below are illustrative 24-character Mongo ObjectId strings. All
dates are ISO-8601 strings.

**The `Location` shape**, used everywhere an address/region is needed
(errand/RFQ/catalog locations, service regions, delivery/cleaning
addresses):
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
`country`, `state`, and `city` are required; `area`, `postalCode`,
`latitude`, `longitude` are optional. `state` means whatever a country calls
its top-level administrative region (a UK county/region, a Nigerian state,
etc.) — the field name is generic. **Region search/browse** (catalog, errand
and RFQ feeds) matches on `state` + `city`; **region notifications** (new
errand/RFQ alerts) match on `state` alone — a broader net, so a runner/
supplier doesn't miss an opportunity over a city-name mismatch.

**The `AccountProfile` shape**, returned by several endpoints below:
```json
{
  "id": "65f1a2b3c4d5e6f7a8b9c0d1",
  "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
  "roles": ["RUNNER"],
  "accountKind": "INDIVIDUAL",
  "businessName": null,
  "serviceRegions": [ { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": "Shoreditch", "postalCode": "E1 6AN", "latitude": 51.5074, "longitude": -0.1278 } ],
  "isActive": true,
  "adminRole": null,
  "jobCategoryIds": ["65f1a2b3c4d5e6f7a8b9c0d2"],
  "suspensionReason": null,
  "suspendedAt": null,
  "suspendedBy": null,
  "createdAt": "2026-09-01T10:00:00.000Z",
  "updatedAt": "2026-09-01T10:00:00.000Z"
}
```
`roles` is one or more of `INDIVIDUAL_CUSTOMER`, `RUNNER`, `BUSINESS_BUYER`,
`BUSINESS_SUPPLIER` (never `CLEANING_PROVIDER` — that's seeded, not
self-selected). `accountKind` (`INDIVIDUAL` or `BUSINESS`) is *derived*
automatically from `roles` at sign-up — choosing `BUSINESS_BUYER`/
`BUSINESS_SUPPLIER` makes it `BUSINESS`; it's not a separate question you
answer. `adminRole`/`suspension*` fields are almost always `null`/`false`
for a regular account — see `ADMIN_API.md` for what sets them.

**The sanitized `User` shape** (`passwordHash` and `oauthId` are always
stripped before a `User` is returned anywhere):
```json
{
  "id": "65f1a2b3c4d5e6f7a8b9c0d0",
  "email": "jane@example.co.uk",
  "phone": "+447700900000",
  "oauthProvider": null,
  "name": "Jane Doe",
  "avatarUrl": null,
  "createdAt": "2026-09-01T10:00:00.000Z",
  "updatedAt": "2026-09-01T10:00:00.000Z"
}
```

---

## 1. Auth — `/api/auth`

### `POST /api/auth/signup` *(public)*

**Request body:**
```json
{
  "email": "jane@example.co.uk",
  "phone": "+447700900000",
  "password": "at-least-8-characters",
  "name": "Jane Doe",
  "roles": ["RUNNER"],
  "businessName": null,
  "serviceRegions": [
    { "country": "United Kingdom", "state": "Greater London", "city": "London", "postalCode": "E1 6AN" }
  ]
}
```
- `phone` is optional. `password` must be ≥ 8 characters. `name` is required.
- `roles`: 1+ of `INDIVIDUAL_CUSTOMER`, `RUNNER`, `BUSINESS_BUYER`,
  `BUSINESS_SUPPLIER` — no duplicates. `CLEANING_PROVIDER` is not a valid
  value here at all (rejected by validation, not just blocked by business
  logic).
- `businessName` is **required** if `roles` includes `BUSINESS_BUYER` or
  `BUSINESS_SUPPLIER`.
- `serviceRegions` (array of `Location`) is **required** (min 1) if `roles`
  includes `RUNNER` or `BUSINESS_SUPPLIER`.

**Response — `201`:**
```json
{
  "user": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d0",
    "email": "jane@example.co.uk",
    "phone": "+447700900000",
    "oauthProvider": null,
    "name": "Jane Doe",
    "avatarUrl": null,
    "createdAt": "2026-10-01T10:00:00.000Z",
    "updatedAt": "2026-10-01T10:00:00.000Z"
  },
  "profile": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
    "roles": ["RUNNER"],
    "accountKind": "INDIVIDUAL",
    "businessName": null,
    "serviceRegions": [
      { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E1 6AN", "latitude": null, "longitude": null }
    ],
    "isActive": true,
    "adminRole": null,
    "jobCategoryIds": [],
    "suspensionReason": null,
    "suspendedAt": null,
    "suspendedBy": null,
    "createdAt": "2026-10-01T10:00:00.000Z",
    "updatedAt": "2026-10-01T10:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
The session cookie is also set on this response — `token` is given in the
body too for mobile/native clients that send it back as `Authorization:
Bearer <token>` instead of relying on cookies.

**Errors:**
- `400` — zod message, e.g. `{ "error": "Password must be at least 8 characters." }`, `{ "error": "businessName is required for BUSINESS_BUYER or BUSINESS_SUPPLIER roles." }`, `{ "error": "serviceRegions is required for RUNNER or BUSINESS_SUPPLIER roles." }`, `{ "error": "Duplicate roles are not allowed." }`
- `409` — `{ "error": "An account with this email or phone already exists." }`

---

### `POST /api/auth/login` *(public)*

**Request body:**
```json
{ "email": "jane@example.co.uk", "password": "at-least-8-characters" }
```

**Response — `200`:** same shape as signup's `201` (`user`, `profile`,
`token`), minus the `201` status — session cookie set the same way.

**Errors:**
- `401` — `{ "error": "Invalid email or password." }` (also returned for an
  OAuth-only account with no password set — deliberately the same message
  as a wrong password, so emails in use aren't leaked)
- `403` — `{ "error": "This account has been deactivated." }` (suspended account)
- `500` — `{ "error": "Account profile is missing. Contact support." }` (should never happen; signup always creates both together)

---

### `POST /api/auth/logout`

No request body.

**Response — `200`:**
```json
{ "success": true }
```
Clears the session cookie.

---

### `GET /api/auth/me`

No request body.

**Response — `200`:**
```json
{
  "user": { "id": "65f1a2b3c4d5e6f7a8b9c0d0", "email": "jane@example.co.uk", "phone": "+447700900000", "oauthProvider": null, "name": "Jane Doe", "avatarUrl": null, "createdAt": "...", "updatedAt": "..." },
  "profile": { "id": "65f1a2b3c4d5e6f7a8b9c0d1", "userId": "65f1a2b3c4d5e6f7a8b9c0d0", "roles": ["RUNNER"], "accountKind": "INDIVIDUAL", "businessName": null, "serviceRegions": [], "isActive": true, "adminRole": null, "jobCategoryIds": [], "suspensionReason": null, "suspendedAt": null, "suspendedBy": null, "createdAt": "...", "updatedAt": "..." }
}
```

**Errors:** `401` — `{ "error": "Session is no longer valid." }` (also returned if the account/profile was deleted out from under a still-valid token).

---

## 2. Account — `/api/account`, `/api/accounts`

### `PATCH /api/account`

**Request body** (all fields optional — send only what's changing):
```json
{
  "name": "Jane A. Doe",
  "avatarUrl": "https://files.example.com/avatars/jane.jpg",
  "phone": "+447700900001",
  "businessName": "Jane's Deliveries Ltd",
  "serviceRegions": [
    { "country": "United Kingdom", "state": "Greater Manchester", "city": "Manchester" }
  ]
}
```

**Response — `200`:**
```json
{
  "user": { "id": "65f1a2b3c4d5e6f7a8b9c0d0", "email": "jane@example.co.uk", "phone": "+447700900001", "oauthProvider": null, "name": "Jane A. Doe", "avatarUrl": "https://files.example.com/avatars/jane.jpg", "createdAt": "...", "updatedAt": "2026-10-01T11:00:00.000Z" },
  "profile": { "id": "65f1a2b3c4d5e6f7a8b9c0d1", "userId": "65f1a2b3c4d5e6f7a8b9c0d0", "roles": ["RUNNER"], "accountKind": "INDIVIDUAL", "businessName": "Jane's Deliveries Ltd", "serviceRegions": [{ "country": "United Kingdom", "state": "Greater Manchester", "city": "Manchester", "area": null, "postalCode": null, "latitude": null, "longitude": null }], "isActive": true, "adminRole": null, "jobCategoryIds": [], "suspensionReason": null, "suspendedAt": null, "suspendedBy": null, "createdAt": "...", "updatedAt": "2026-10-01T11:00:00.000Z" }
}
```

**Errors:** `409` — `{ "error": "That phone number is already in use by another account." }` · `400` zod message (e.g. invalid `avatarUrl`).

*(There is deliberately no `GET /api/account` — it would duplicate `GET /api/auth/me` above.)*

---

### `GET /api/accounts/{id}` *(public)*

`{id}` is an `AccountProfile.id`. No request body.

**Response — `200`:**
```json
{
  "account": {
    "id": "65f1a2b3c4d5e6f7a8b9c0e2",
    "name": "Acme Furnishings Ltd",
    "avatarUrl": null,
    "roles": ["BUSINESS_SUPPLIER"],
    "businessName": "Acme Furnishings Ltd",
    "serviceRegions": [
      { "country": "United Kingdom", "state": "Greater London", "city": "London" }
    ],
    "createdAt": "2026-09-10T09:00:00.000Z"
  }
}
```
Note this is a deliberately stripped-down shape, not the full
`AccountProfile` — `serviceRegions` here only has `country`/`state`/`city`
(no `area`, `postalCode`, or coordinates), and there's no `email`, `phone`,
`isActive`, `adminRole`, etc.

**Errors:** `404` — `{ "error": "Account not found." }` (also returned for a suspended/inactive account, so suspension status isn't leaked either).

---

### `GET /api/account/revenue`

Your own earnings/spending summary — the personal counterpart to the admin
platform-wide `GET /api/admin/revenue` (see `ADMIN_API.md`), same shape,
scoped to you. Useful for a runner/supplier/cleaning-provider "my earnings"
page, or a buyer's "my spending" view.

Query params (all optional): `role` — `"payee"` (default: what you've
**earned**) or `"payer"` (what you've **spent**); `startDate`, `endDate`
(filter `createdAt`); `paymentStatus` (defaults to `"PAID"` — pass `"ALL"`
to include `PENDING`/`FAILED` orders too). No request body.

**Response — `200`** (default, `role=payee`, as a runner who's completed a few errands and one delivery):
```json
{
  "role": "payee",
  "range": { "startDate": null, "endDate": null },
  "paymentStatusFilter": "PAID",
  "totals": { "orderCount": 5, "grossAmount": 180.0, "commissionAmount": 27.0, "netAmount": 153.0 },
  "bySourceType": [
    { "sourceType": "ERRAND", "orderCount": 5, "grossAmount": 180.0, "commissionAmount": 27.0, "netAmount": 153.0 },
    { "sourceType": "RFQ_QUOTATION", "orderCount": 0, "grossAmount": 0, "commissionAmount": 0, "netAmount": 0 },
    { "sourceType": "CATALOG_PURCHASE", "orderCount": 0, "grossAmount": 0, "commissionAmount": 0, "netAmount": 0 },
    { "sourceType": "CLEANING_BOOKING", "orderCount": 0, "grossAmount": 0, "commissionAmount": 0, "netAmount": 0 }
  ],
  "deliveryEarnings": { "jobCount": 1, "totalAmount": 8.5 }
}
```
`netAmount` is `grossAmount - commissionAmount` per bucket — the number
that actually matters on an earnings view, since `grossAmount` includes the
platform's cut. `deliveryEarnings` only appears when `role=payee`: it's the
full amount of any `DeliveryJob` payments where you were the assignee —
no commission is deducted from delivery fees, so `totalAmount` here is
already your take-home.

**Response — `200`** (`?role=payer`, as a customer):
```json
{
  "role": "payer",
  "range": { "startDate": null, "endDate": null },
  "paymentStatusFilter": "PAID",
  "totals": { "orderCount": 3, "grossAmount": 95.0, "commissionAmount": 14.25, "netAmount": 95.0 },
  "bySourceType": [
    { "sourceType": "ERRAND", "orderCount": 3, "grossAmount": 95.0, "commissionAmount": 14.25, "netAmount": 95.0 },
    { "sourceType": "RFQ_QUOTATION", "orderCount": 0, "grossAmount": 0, "commissionAmount": 0, "netAmount": 0 },
    { "sourceType": "CATALOG_PURCHASE", "orderCount": 0, "grossAmount": 0, "commissionAmount": 0, "netAmount": 0 },
    { "sourceType": "CLEANING_BOOKING", "orderCount": 0, "grossAmount": 0, "commissionAmount": 0, "netAmount": 0 }
  ]
}
```
On the payer side `netAmount` just equals `grossAmount` (what you actually
paid out — commission isn't "deducted" from a payer's perspective, it's
already included in the price), and `deliveryEarnings` is omitted entirely
— delivery *spending* isn't tracked here since `DeliveryJob` has no
`requesterId` field of its own (it's derived from the linked errand/order;
see `lib/deliveryAuth.ts`), so there's no cheap way to scope it per-payer
the way assignee-scoping works for earnings. Use `GET /api/delivery-jobs`
for your own delivery request history instead.

---

## 3. Job categories & verification

Two independent tracks: **business verification** (proves a `BUSINESS`-kind
account is real; gates posting RFQs and listing catalog items) and
**job-category verification** (proves a `RUNNER` is eligible for a specific
kind of job; gates accepting errands in that category).

### `GET /api/job-categories` *(public)*

No request body. The list an individual sees when choosing "get a job."

**Response — `200`:**
```json
{
  "categories": [
    { "id": "65f1a2b3c4d5e6f7a8b9c0d2", "name": "Furniture moving", "description": "Lifting and transporting furniture.", "requiresVerification": true, "isActive": true, "createdAt": "...", "updatedAt": "..." },
    { "id": "65f1a2b3c4d5e6f7a8b9c0d3", "name": "Grocery pickup", "description": null, "requiresVerification": false, "isActive": true, "createdAt": "...", "updatedAt": "..." }
  ]
}
```

---

### `POST /api/account/job-categories`

`RUNNER`-only. Selects which categories you want to work in. **Every
selected category that requires verification must have documents supplied
in this same call** — selecting two verification-gated categories means
submitting proof for both at once, not one at a time.

**Request body:**
```json
{
  "jobCategoryIds": ["65f1a2b3c4d5e6f7a8b9c0d2", "65f1a2b3c4d5e6f7a8b9c0d3"],
  "verificationDocuments": {
    "65f1a2b3c4d5e6f7a8b9c0d2": ["https://files.example.com/id-front.jpg", "https://files.example.com/id-back.jpg"]
  }
}
```
`verificationDocuments` is keyed by `jobCategoryId`, only required for the
categories that actually `requiresVerification: true` (here, `...0d3`
"Grocery pickup" needs none, so it's omitted).

**Response — `200`:**
```json
{
  "profile": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
    "roles": ["RUNNER"],
    "accountKind": "INDIVIDUAL",
    "businessName": null,
    "serviceRegions": [],
    "isActive": true,
    "adminRole": null,
    "jobCategoryIds": ["65f1a2b3c4d5e6f7a8b9c0d2", "65f1a2b3c4d5e6f7a8b9c0d3"],
    "suspensionReason": null,
    "suspendedAt": null,
    "suspendedBy": null,
    "createdAt": "...",
    "updatedAt": "2026-10-01T11:10:00.000Z"
  },
  "verifications": [
    { "category": "Furniture moving", "jobCategoryId": "65f1a2b3c4d5e6f7a8b9c0d2", "status": "PENDING" }
  ]
}
```
Note `verifications` here is a **small summary array** (`category`,
`jobCategoryId`, `status`) — not full `Verification` records — and only
lists categories that needed verification at all (a category with
`requiresVerification: false` never appears in it). Re-selecting a category
that's already `APPROVED` or still `PENDING` doesn't create a duplicate
submission; only a fresh selection or one that was previously `REJECTED`
creates a new one. Calling this again with a different `jobCategoryIds`
list fully replaces your previous selection.

**Errors:**
- `400` — `{ "error": "One or more job category ids are invalid or inactive." }`
- `400` — `{ "error": "Verification documents are required for: Furniture moving." }` (lists every category missing docs by name)
- `403` — not a `RUNNER`.

---

### `GET /api/account/job-categories`

No request body. Your currently-selected categories plus your
job-category verification records.

**Response — `200`:**
```json
{
  "categories": [
    { "id": "65f1a2b3c4d5e6f7a8b9c0d2", "name": "Furniture moving", "description": "Lifting and transporting furniture.", "requiresVerification": true, "isActive": true, "createdAt": "...", "updatedAt": "..." }
  ],
  "verifications": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c101",
      "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0d1",
      "type": "JOB_CATEGORY",
      "jobCategoryId": "65f1a2b3c4d5e6f7a8b9c0d2",
      "status": "PENDING",
      "documents": ["https://files.example.com/id-front.jpg", "https://files.example.com/id-back.jpg"],
      "notes": null,
      "rejectionReason": null,
      "reviewedBy": null,
      "submittedAt": "2026-10-01T11:10:00.000Z",
      "reviewedAt": null
    }
  ]
}
```
Here `verifications` is the **full** `Verification` record list (unlike the
summary shape returned by the `POST` above).

**Errors:** `403` — not a `RUNNER`.

---

### `POST /api/account/business-verification`

Only for `accountKind: "BUSINESS"` accounts.

**Request body:**
```json
{
  "documents": ["https://files.example.com/certificate-of-incorporation.pdf"],
  "notes": "Companies House number 12345678"
}
```
`notes` is optional.

**Response — `201`:**
```json
{
  "verification": {
    "id": "65f1a2b3c4d5e6f7a8b9c100",
    "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0e2",
    "type": "BUSINESS",
    "jobCategoryId": null,
    "status": "PENDING",
    "documents": ["https://files.example.com/certificate-of-incorporation.pdf"],
    "notes": "Companies House number 12345678",
    "rejectionReason": null,
    "reviewedBy": null,
    "submittedAt": "2026-10-01T11:15:00.000Z",
    "reviewedAt": null
  }
}
```

**Errors:**
- `400` — `{ "error": "Only accounts registered as a business need business verification." }` (an `INDIVIDUAL`-kind account calling this)
- `409` — `{ "error": "This business is already verified." }` or `{ "error": "A business verification is already pending review." }`
- `400` — `{ "error": "At least one document is required." }`

---

### `GET /api/verifications`

No request body. Every verification you've ever submitted (business +
job-category), newest first.

**Response — `200`:**
```json
{
  "verifications": [
    { "id": "65f1a2b3c4d5e6f7a8b9c100", "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0e2", "type": "BUSINESS", "jobCategoryId": null, "status": "PENDING", "documents": ["https://files.example.com/certificate-of-incorporation.pdf"], "notes": "Companies House number 12345678", "rejectionReason": null, "reviewedBy": null, "submittedAt": "2026-10-01T11:15:00.000Z", "reviewedAt": null }
  ]
}
```

---

### `GET /api/verifications/{id}`

You (the submitter), or a platform admin, only. No request body.

**Response — `200`:** single `Verification` object, same shape as above.

**Errors:** `404` — `{ "error": "Verification not found." }` · `403` — `{ "error": "You do not have permission to view this verification." }`

---

## 4. Errands — `/api/errands` (flow A: "go get this for me")

Posting one requires role `INDIVIDUAL_CUSTOMER` or `BUSINESS_BUYER`.
Accepting one requires `RUNNER`.

### `POST /api/errands`

**Request body:**
```json
{
  "description": "Pick up a parcel from the post office and drop it at my flat",
  "category": "delivery",
  "location": { "country": "United Kingdom", "state": "Greater London", "city": "London", "postalCode": "E1 6AN" },
  "budget": 15.0,
  "photos": ["https://files.example.com/errand-photo-1.jpg"],
  "deadline": "2026-10-02T17:00:00Z"
}
```
Only `description`, `category`, and `location` are required.

**Response — `201`:**
```json
{
  "errand": {
    "id": "65f1a2b3c4d5e6f7a8b9c400",
    "customerId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "description": "Pick up a parcel from the post office and drop it at my flat",
    "category": "delivery",
    "location": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E1 6AN", "latitude": null, "longitude": null },
    "budget": 15.0,
    "photos": ["https://files.example.com/errand-photo-1.jpg"],
    "deadline": "2026-10-02T17:00:00.000Z",
    "status": "OPEN",
    "runnerId": null,
    "createdAt": "2026-10-01T12:00:00.000Z",
    "updatedAt": "2026-10-01T12:00:00.000Z"
  }
}
```
Region-matched runners (by `state`) are notified in the background.

**Errors:** `400` zod message (missing `description`/`category`/`location`) · `403` — wrong role.

---

### `GET /api/errands`

Query params: `mine=true` (your own posted errands, any status) ·
`assignedToMe=true` (requires `RUNNER`; errands assigned to you) · neither
(the open browse feed — `status: OPEN`, region-scoped to your
`serviceRegions` if you're a `RUNNER`) · `category`, `status` (additive
filters on top of any of the above) · `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9c400", "customerId": "65f1a2b3c4d5e6f7a8b9c0d1", "description": "Pick up a parcel...", "category": "delivery", "location": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E1 6AN", "latitude": null, "longitude": null }, "budget": 15.0, "photos": [], "deadline": "2026-10-02T17:00:00.000Z", "status": "OPEN", "runnerId": null, "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

**Errors:** `403` if `assignedToMe=true` and you're not a `RUNNER`.

---

### `GET /api/errands/{id}`

Any authenticated account. No request body.

**Response — `200`:** `{ "errand": { /* same shape as above */ } }`

**Errors:** `404` — `{ "error": "Errand request not found." }`

---

### `PATCH /api/errands/{id}`

Customer-only, only while `status: OPEN`.

**Request body** (all fields optional, same shape as create):
```json
{ "budget": 20.0, "deadline": "2026-10-03T17:00:00Z" }
```

**Response — `200`:** `{ "errand": { /* updated */ } }`

**Errors:**
- `403` — `{ "error": "Only the customer who posted this errand can edit it." }`
- `409` — `{ "error": "An errand can only be edited while it is still OPEN." }`
- `404` — not found.

---

### `DELETE /api/errands/{id}`

Customer-only, only while `status: OPEN` (sets `status: CANCELLED` — not a
hard delete). No request body.

**Response — `200`:** `{ "errand": { /* status: "CANCELLED" */ } }`

**Errors:**
- `403` — `{ "error": "Only the customer who posted this errand can cancel it." }`
- `409` — `{ "error": "Only an OPEN errand can be cancelled this way — use the status endpoint once it has a runner." }`

---

### `POST /api/errands/{id}/accept`

`RUNNER`-only. No request body.

**Response — `200`:**
```json
{ "errand": { "id": "65f1a2b3c4d5e6f7a8b9c400", "customerId": "...", "description": "...", "category": "delivery", "location": { /* ... */ }, "budget": 15.0, "photos": [], "deadline": "...", "status": "ACCEPTED", "runnerId": "65f1a2b3c4d5e6f7a8b9c0d1", "createdAt": "...", "updatedAt": "..." } }
```

**Errors:**
- `409` — `{ "error": "This errand is no longer open for acceptance." }`
- `409` — `{ "error": "This errand has already been accepted by another runner." }`
- `409` — `{ "error": "This errand was just accepted by someone else." }` (race condition — two runners accepting simultaneously)
- `400` — `{ "error": "You cannot accept your own errand request." }`
- `403` — `{ "error": "The \"Furniture moving\" category requires verification before you can accept jobs in it. Submit via POST /api/account/job-categories." }`

---

### `POST /api/errands/{id}/status`

Customer or assigned runner, depending on the transition.

**Request body:**
```json
{ "status": "IN_PROGRESS" }
```
`status` is one of `IN_PROGRESS`, `DELIVERED`, `COMPLETED`, `CANCELLED`.

| From | To | Actor |
|---|---|---|
| OPEN | CANCELLED | customer |
| ACCEPTED | IN_PROGRESS | runner |
| ACCEPTED | CANCELLED | customer or runner |
| IN_PROGRESS | DELIVERED | runner |
| IN_PROGRESS | CANCELLED | customer |
| DELIVERED | COMPLETED | customer |

**Response — `200`:** `{ "errand": { /* status updated */ } }`

**Errors:**
- `403` — `{ "error": "You are not a party to this errand." }`
- `409` — `{ "error": "Cannot move an errand from OPEN to COMPLETED." }` (invalid transition — message interpolates the actual from/to)
- `409` — `{ "error": "Only the runner can move an errand from ACCEPTED to IN_PROGRESS." }` (wrong actor for an otherwise-valid transition)

---

### `POST /api/errands/{id}/pay`

Customer-only, only once `status: COMPLETED`.

**Request body:**
```json
{ "amount": 15.0 }
```
There's no stored "agreed price" — state the final amount you and the
runner settled on.

**Response — `201`:**
```json
{
  "order": {
    "id": "65f1a2b3c4d5e6f7a8b9c500",
    "sourceType": "ERRAND",
    "sourceErrandId": "65f1a2b3c4d5e6f7a8b9c400",
    "sourceQuotationId": null,
    "sourceCatalogItemId": null,
    "sourceCleaningBookingId": null,
    "amount": 15.0,
    "commissionRate": 0.15,
    "commissionAmount": 2.25,
    "payerId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "payeeId": "65f1a2b3c4d5e6f7a8b9c0e5",
    "paymentStatus": "PAID",
    "createdAt": "2026-10-01T13:00:00.000Z",
    "updatedAt": "2026-10-01T13:00:00.000Z"
  },
  "payment": {
    "id": "65f1a2b3c4d5e6f7a8b9c600",
    "sourceType": "ORDER",
    "orderId": "65f1a2b3c4d5e6f7a8b9c500",
    "deliveryJobId": null,
    "cleaningBookingId": null,
    "amount": 15.0,
    "commissionAmount": 2.25,
    "deliveryFee": null,
    "status": "PAID",
    "provider": "mock",
    "providerRef": "mock_7e2f...",
    "paidAt": "2026-10-01T13:00:00.000Z",
    "createdAt": "2026-10-01T13:00:00.000Z",
    "updatedAt": "2026-10-01T13:00:00.000Z"
  }
}
```
`commissionRate`/`commissionAmount` reflect whatever rate was in effect at
payment time (DB override via `ADMIN_API.md`'s commission-rates endpoint, or
the env default). The payee gets an `ORDER_PAID` notification.

**Errors:**
- `403` — `{ "error": "Only the customer who posted this errand can pay for it." }`
- `409` — `{ "error": "An errand can only be paid once it is marked COMPLETED." }`
- `409` — `{ "error": "This errand has already been paid for." }`
- `400` — `{ "error": "Amount must be greater than zero." }`
- `402` — `{ "error": "Payment failed. The order has been recorded as FAILED." }` (mock provider failure — practically never happens, but modeled)

---

## 5. RFQs & Quotations — `/api/rfqs`, `/api/quotations` (flow B: procurement)

Posting an RFQ requires role `BUSINESS_BUYER` **and** an `APPROVED` business
verification. Quoting requires role `BUSINESS_SUPPLIER`.

### `POST /api/rfqs`

**Request body:**
```json
{
  "title": "Furnishing a 3-bed flat",
  "lineItems": [
    { "name": "Fridge freezer", "quantity": 1, "notes": "American style" },
    { "name": "Sofa", "quantity": 1 }
  ],
  "region": { "country": "United Kingdom", "state": "Greater London", "city": "London" },
  "deadline": "2026-10-20T00:00:00Z"
}
```
`title` and `deadline` are optional. Each line item needs `name` and
`quantity` (≥ 1); `notes` optional.

**Response — `201`:**
```json
{
  "rfq": {
    "id": "65f1a2b3c4d5e6f7a8b9c700",
    "buyerId": "65f1a2b3c4d5e6f7a8b9c0e2",
    "title": "Furnishing a 3-bed flat",
    "lineItems": [
      { "itemId": "a1b2c3d4-...", "name": "Fridge freezer", "quantity": 1, "notes": "American style" },
      { "itemId": "e5f6a7b8-...", "name": "Sofa", "quantity": 1, "notes": null }
    ],
    "region": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": null, "latitude": null, "longitude": null },
    "deadline": "2026-10-20T00:00:00.000Z",
    "status": "OPEN",
    "awardedQuotationId": null,
    "createdAt": "2026-10-01T13:10:00.000Z",
    "updatedAt": "2026-10-01T13:10:00.000Z"
  }
}
```
`itemId` on each line item is always server-generated (a UUID) — you never
supply it. Region-matched suppliers are notified in the background.

**Errors:**
- `403` — `{ "error": "Business verification is required before posting an RFQ. Submit documents via POST /api/account/business-verification." }`
- `400` — zod message (missing `lineItems`/`region`, or a line item missing `name`/`quantity`).
- `403` — wrong role.

---

### `GET /api/rfqs`

Query params: `mine=true` (your own) or the open, region-scoped browse feed
for suppliers; `status`, `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [ { "id": "65f1a2b3c4d5e6f7a8b9c700", "buyerId": "...", "title": "Furnishing a 3-bed flat", "lineItems": [ /* ... */ ], "region": { /* ... */ }, "deadline": "...", "status": "OPEN", "awardedQuotationId": null, "createdAt": "...", "updatedAt": "..." } ],
  "page": 1, "pageSize": 20, "total": 1
}
```

---

### `GET /api/rfqs/{id}`

**Response — `200`:**
```json
{
  "rfq": { "id": "65f1a2b3c4d5e6f7a8b9c700", "buyerId": "...", "title": "...", "lineItems": [ /* ... */ ], "region": { /* ... */ }, "deadline": "...", "status": "OPEN", "awardedQuotationId": null, "createdAt": "...", "updatedAt": "..." },
  "quotations": [
    { "id": "65f1a2b3c4d5e6f7a8b9c800", "rfqId": "65f1a2b3c4d5e6f7a8b9c700", "supplierId": "65f1a2b3c4d5e6f7a8b9c0e5", "lineItems": [ { "rfqItemId": "a1b2c3d4-...", "name": "Fridge freezer", "price": 450.0, "notes": null, "available": true } ], "totalPrice": 450.0, "notes": "Can deliver within 5 days", "status": "SUBMITTED", "createdAt": "...", "updatedAt": "..." }
  ]
}
```
The buyer sees every quotation; a supplier sees only their own; anyone else
gets `"quotations": []`.

**Errors:** `404` — `{ "error": "RFQ not found." }`

---

### `PATCH /api/rfqs/{id}`

Buyer-only, only while `OPEN`.

**Request body** (all optional, same shape as create):
```json
{ "deadline": "2026-10-25T00:00:00Z" }
```
Replacing `lineItems` wholesale regenerates `itemId`s for any new entries
(existing ones are kept by position where possible, to avoid orphaning a
quotation's `rfqItemId` reference).

**Response — `200`:** `{ "rfq": { /* updated */ } }`

**Errors:**
- `403` — `{ "error": "Only the buyer who posted this RFQ can edit it." }`
- `409` — `{ "error": "An RFQ can only be edited while it is still OPEN." }`

---

### `DELETE /api/rfqs/{id}` / `POST /api/rfqs/{id}/close`

Identical effect — buyer-only, `OPEN → CLOSED`, no request body for either.
`DELETE` is semantic REST; `/close` is an action-verb alias.

**Response — `200`:** `{ "rfq": { /* status: "CLOSED" */ } }`

**Errors:**
- `403` — `{ "error": "Only the buyer who posted this RFQ can close it." }`
- `409` — `{ "error": "This RFQ is already closed or awarded." }`

---

### `POST /api/rfqs/{id}/quotations`

`BUSINESS_SUPPLIER`-only, only while the RFQ is `OPEN`; one live
(`SUBMITTED`) quotation per supplier per RFQ.

**Request body:**
```json
{
  "lineItems": [
    { "rfqItemId": "a1b2c3d4-...", "name": "Fridge freezer", "price": 450.0, "notes": null, "available": true }
  ],
  "totalPrice": 450.0,
  "notes": "Can deliver within 5 days"
}
```
`rfqItemId` (ties a priced line back to the RFQ's own line item), `notes`,
and `available` (defaults `true`) are optional per line item. `totalPrice`
is optional — computed as the sum of line `price`s if omitted.

**Response — `201`:**
```json
{
  "quotation": {
    "id": "65f1a2b3c4d5e6f7a8b9c800",
    "rfqId": "65f1a2b3c4d5e6f7a8b9c700",
    "supplierId": "65f1a2b3c4d5e6f7a8b9c0e5",
    "lineItems": [ { "rfqItemId": "a1b2c3d4-...", "name": "Fridge freezer", "price": 450.0, "notes": null, "available": true } ],
    "totalPrice": 450.0,
    "notes": "Can deliver within 5 days",
    "status": "SUBMITTED",
    "createdAt": "2026-10-01T13:20:00.000Z",
    "updatedAt": "2026-10-01T13:20:00.000Z"
  }
}
```
The buyer gets a `QUOTATION_RECEIVED` notification.

**Errors:**
- `409` — `{ "error": "This RFQ is no longer accepting quotations." }`
- `400` — `{ "error": "You cannot quote on your own RFQ." }`
- `409` — `{ "error": "You already have a submitted quotation on this RFQ — update or withdraw it instead." }`

---

### `GET /api/rfqs/{id}/quotations`

**Response — `200`:** `{ "quotations": [ /* ... */ ] }` — buyer sees all, supplier sees only their own.

**Errors:** `404` — RFQ not found.

---

### `GET /api/quotations/{id}`

Submitting supplier or the parent RFQ's buyer only.

**Response — `200`:** `{ "quotation": { /* single object, same shape as above */ } }`

**Errors:** `404` — `{ "error": "Quotation not found." }` · `403` — `{ "error": "You do not have permission to view this quotation." }`

---

### `PATCH /api/quotations/{id}`

Supplier-only, only while `status: SUBMITTED` and the RFQ is still `OPEN`.

**Request body** (all optional, same shape as create):
```json
{ "lineItems": [ { "rfqItemId": "a1b2c3d4-...", "name": "Fridge freezer", "price": 420.0 } ] }
```

**Response — `200`:** `{ "quotation": { /* updated, totalPrice recomputed if lineItems changed and totalPrice omitted */ } }`

**Errors:**
- `403` — `{ "error": "Only the submitting supplier can edit this quotation." }`
- `409` — `{ "error": "Only a SUBMITTED quotation can be edited." }`
- `409` — `{ "error": "This RFQ is no longer open, so its quotations are locked." }`

---

### `DELETE /api/quotations/{id}`

Same restrictions as `PATCH`. No request body. **Hard delete** (there's no
`WITHDRAWN` status in the schema — only `SUBMITTED`/`ACCEPTED`/`REJECTED`).

**Response — `200`:** `{ "success": true }`

**Errors:** same three as `PATCH` above.

---

### `POST /api/rfqs/{id}/award`

Buyer-only, only while `OPEN`.

**Request body:**
```json
{ "quotationIds": ["65f1a2b3c4d5e6f7a8b9c800", "65f1a2b3c4d5e6f7a8b9c801"] }
```
An array so you can award more than one supplier on the same RFQ (e.g.
splitting line items across suppliers).

**Response — `200`:**
```json
{
  "rfq": { "id": "65f1a2b3c4d5e6f7a8b9c700", "buyerId": "...", "title": "...", "lineItems": [ /* ... */ ], "region": { /* ... */ }, "deadline": "...", "status": "AWARDED", "awardedQuotationId": "65f1a2b3c4d5e6f7a8b9c800", "createdAt": "...", "updatedAt": "..." },
  "awardedQuotations": [
    { "id": "65f1a2b3c4d5e6f7a8b9c800", "rfqId": "...", "supplierId": "...", "lineItems": [ /* ... */ ], "totalPrice": 450.0, "notes": "...", "status": "ACCEPTED", "createdAt": "...", "updatedAt": "..." }
  ]
}
```
Every listed quotation becomes `ACCEPTED`; every other `SUBMITTED`
quotation on the RFQ becomes `REJECTED`. **Note**: `rfq.awardedQuotationId`
only ever holds the *first* id from `quotationIds` even if several were
awarded — `Quotation.status: "ACCEPTED"` across the RFQ is the authoritative
list of every winner, not this single field. All named suppliers (winners
and losers) are notified of the outcome.

**Errors:**
- `403` — `{ "error": "Only the buyer who posted this RFQ can award it." }`
- `409` — `{ "error": "This RFQ has already been awarded or closed." }`
- `400` — `{ "error": "One or more quotationIds do not belong to this RFQ." }`
- `409` — `{ "error": "Quotation 65f1a2b3c4d5e6f7a8b9c800 is not in a SUBMITTED state." }`

---

### `POST /api/quotations/{id}/pay`

Buyer-only, only for an `ACCEPTED` quotation.

No request body — amount is read from `quotation.totalPrice`.

**Response — `201`:**
```json
{
  "order": { "id": "65f1a2b3c4d5e6f7a8b9c501", "sourceType": "RFQ_QUOTATION", "sourceErrandId": null, "sourceQuotationId": "65f1a2b3c4d5e6f7a8b9c800", "sourceCatalogItemId": null, "sourceCleaningBookingId": null, "amount": 450.0, "commissionRate": 0.1, "commissionAmount": 45.0, "payerId": "65f1a2b3c4d5e6f7a8b9c0e2", "payeeId": "65f1a2b3c4d5e6f7a8b9c0e5", "paymentStatus": "PAID", "createdAt": "...", "updatedAt": "..." },
  "payment": { "id": "65f1a2b3c4d5e6f7a8b9c601", "sourceType": "ORDER", "orderId": "65f1a2b3c4d5e6f7a8b9c501", "deliveryJobId": null, "cleaningBookingId": null, "amount": 450.0, "commissionAmount": 45.0, "deliveryFee": null, "status": "PAID", "provider": "mock", "providerRef": "mock_9c1a...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
}
```

**Errors:**
- `403` — `{ "error": "Only the buyer who posted this RFQ can pay for a quotation." }`
- `409` — `{ "error": "Only an ACCEPTED (awarded) quotation can be paid." }`
- `409` — `{ "error": "This quotation has already been paid for." }`
- `402` — payment failure (see errand pay above).

---

## 6. Catalog — `/api/catalog` (flow C: browse & buy)

Browsing is **public**. Listing requires `BUSINESS_SUPPLIER` **and** an
`APPROVED` business verification.

### `POST /api/catalog`

**Request body:**
```json
{
  "title": "3-seater grey fabric sofa",
  "description": "Barely used, smoke-free home",
  "category": "furniture",
  "price": 250.0,
  "currency": "GBP",
  "photos": ["https://files.example.com/sofa-1.jpg"],
  "region": { "country": "United Kingdom", "state": "Greater London", "city": "London" },
  "isAvailable": true
}
```
Only `title`, `category`, `price`, and `region` are required. `currency`
defaults to `"GBP"`. `category` is rejected (`400`) if it is or contains
"cleaning", "cleaner", or "housekeeping" (case-insensitive) — that vertical
is exclusively the seeded cleaning provider's.

**Response — `201`:**
```json
{
  "item": {
    "id": "65f1a2b3c4d5e6f7a8b9c900",
    "supplierId": "65f1a2b3c4d5e6f7a8b9c0e5",
    "title": "3-seater grey fabric sofa",
    "description": "Barely used, smoke-free home",
    "category": "furniture",
    "price": 250.0,
    "currency": "GBP",
    "photos": ["https://files.example.com/sofa-1.jpg"],
    "region": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": null, "latitude": null, "longitude": null },
    "isAvailable": true,
    "createdAt": "2026-10-01T13:30:00.000Z",
    "updatedAt": "2026-10-01T13:30:00.000Z"
  }
}
```

**Errors:**
- `403` — `{ "error": "Business verification is required before listing catalog items. Submit documents via POST /api/account/business-verification." }`
- `400` — `{ "error": "Cleaning services are exclusively provided through the platform's cleaning booking flow and cannot be listed as a catalog category." }`
- `400` — zod message (missing `title`/`category`/`region`, negative `price`).

---

### `GET /api/catalog` *(public)*

Query params: `category`, `state`, `city`, `q` (free-text title/description
search), `minPrice`, `maxPrice`, `supplierId`, `page`, `pageSize`. Only
`isAvailable: true` items unless `mine=true` (requires auth +
`BUSINESS_SUPPLIER` — returns all your own listings, including hidden ones).

**Response — `200`:**
```json
{
  "items": [ { "id": "65f1a2b3c4d5e6f7a8b9c900", "supplierId": "...", "title": "3-seater grey fabric sofa", "description": "...", "category": "furniture", "price": 250.0, "currency": "GBP", "photos": [], "region": { /* ... */ }, "isAvailable": true, "createdAt": "...", "updatedAt": "..." } ],
  "page": 1, "pageSize": 20, "total": 1
}
```

**Errors:** `403` if `mine=true` and you're not a `BUSINESS_SUPPLIER`.

---

### `GET /api/catalog/{id}` *(public)*

**Response — `200`:** `{ "item": { /* single object */ } }`

**Errors:** `404` — `{ "error": "Catalog item not found." }`

---

### `PATCH /api/catalog/{id}`

Owner-only.

**Request body** (all optional, same shape as create):
```json
{ "price": 220.0, "isAvailable": true }
```

**Response — `200`:** `{ "item": { /* updated */ } }`

**Errors:**
- `403` — `{ "error": "Only the supplier who listed this item can edit it." }`
- `400` — reserved-category message (same as `POST`) if renaming into "cleaning".

---

### `DELETE /api/catalog/{id}`

Owner-only. **Soft-remove** — sets `isAvailable: false`, not a hard delete
(past orders reference `sourceCatalogItemId`). No request body.

**Response — `200`:** `{ "item": { /* isAvailable: false */ } }`

**Errors:** `403` — `{ "error": "Only the supplier who listed this item can remove it." }`

---

### `POST /api/catalog/{id}/purchase`

Any authenticated account (except the listing's own supplier).

**Request body:**
```json
{ "quantity": 2 }
```
`quantity` is optional, defaults to `1`.

**Response — `201`:**
```json
{
  "order": { "id": "65f1a2b3c4d5e6f7a8b9c502", "sourceType": "CATALOG_PURCHASE", "sourceErrandId": null, "sourceQuotationId": null, "sourceCatalogItemId": "65f1a2b3c4d5e6f7a8b9c900", "sourceCleaningBookingId": null, "amount": 500.0, "commissionRate": 0.1, "commissionAmount": 50.0, "payerId": "65f1a2b3c4d5e6f7a8b9c0d1", "payeeId": "65f1a2b3c4d5e6f7a8b9c0e5", "paymentStatus": "PAID", "createdAt": "...", "updatedAt": "..." },
  "payment": { "id": "65f1a2b3c4d5e6f7a8b9c602", "sourceType": "ORDER", "orderId": "65f1a2b3c4d5e6f7a8b9c502", "deliveryJobId": null, "cleaningBookingId": null, "amount": 500.0, "commissionAmount": 50.0, "deliveryFee": null, "status": "PAID", "provider": "mock", "providerRef": "mock_4b8e...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
}
```
Unlike errands/RFQs, this creates **and immediately charges** the order in
one call — there's no separate acceptance step for a direct catalog
purchase.

**Errors:**
- `404` — `{ "error": "Catalog item not found." }`
- `409` — `{ "error": "This item is no longer available." }`
- `400` — `{ "error": "You cannot purchase your own catalog item." }`
- `402` — payment failure.

---

## 7. Cleaning bookings — `/api/cleaning-bookings`

Any authenticated account can book — no role restriction. The provider is
always the single seeded `CLEANING_PROVIDER` account; you never choose it.

### `POST /api/cleaning-bookings`

**Request body:**
```json
{
  "serviceScope": "DOMESTIC",
  "address": { "country": "United Kingdom", "state": "Greater London", "city": "London", "postalCode": "E1 6AN" },
  "scheduledDate": "2026-10-10T09:00:00Z",
  "notes": "Two bedrooms, one bathroom",
  "price": 60.0
}
```
`serviceScope` is `"DOMESTIC"` or `"COMMERCIAL"`. `notes` and `price` are
optional — `price` can instead be set by the provider when confirming (see
the status endpoint below).

**Response — `201`:**
```json
{
  "booking": {
    "id": "65f1a2b3c4d5e6f7a8b9ca00",
    "customerId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "providerId": "65f1a2b3c4d5e6f7a8b9c0f0",
    "serviceScope": "DOMESTIC",
    "address": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E1 6AN", "latitude": null, "longitude": null },
    "scheduledDate": "2026-10-10T09:00:00.000Z",
    "notes": "Two bedrooms, one bathroom",
    "price": 60.0,
    "status": "PENDING",
    "createdAt": "2026-10-01T13:40:00.000Z",
    "updatedAt": "2026-10-01T13:40:00.000Z"
  }
}
```
The provider gets a `CLEANING_BOOKING_UPDATE` notification.

**Errors:**
- `503` — `{ "error": "No active cleaning provider is configured. Run the database seed script." }` (deployment issue, not a user error)
- `400` — zod message (missing `serviceScope`/`address`/`scheduledDate`).

---

### `GET /api/cleaning-bookings`

Query params: `asProvider=true` (if you *are* the cleaning provider — your
incoming queue) or omitted (your own bookings as customer); `page`,
`pageSize`.

**Response — `200`:**
```json
{
  "items": [ { "id": "65f1a2b3c4d5e6f7a8b9ca00", "customerId": "...", "providerId": "...", "serviceScope": "DOMESTIC", "address": { /* ... */ }, "scheduledDate": "...", "notes": "...", "price": 60.0, "status": "PENDING", "createdAt": "...", "updatedAt": "..." } ],
  "page": 1, "pageSize": 20, "total": 1
}
```

---

### `GET /api/cleaning-bookings/{id}`

Customer or provider only.

**Response — `200`:** `{ "booking": { /* single object */ } }`

**Errors:** `404` · `403` — `{ "error": "You do not have permission to view this booking." }`

---

### `PATCH /api/cleaning-bookings/{id}`

Customer-only, only while `status: PENDING`.

**Request body** (all optional):
```json
{ "scheduledDate": "2026-10-11T09:00:00Z", "notes": "Updated: three bedrooms now" }
```
Only `address`, `scheduledDate`, `notes` can be changed here (not
`serviceScope` or `price`).

**Response — `200`:** `{ "booking": { /* updated */ } }`

**Errors:**
- `403` — `{ "error": "Only the customer who made this booking can edit it." }`
- `409` — `{ "error": "A booking can only be edited while it is still PENDING." }`

---

### `POST /api/cleaning-bookings/{id}/status`

**Request body:**
```json
{ "status": "CONFIRMED", "price": 65.0 }
```
`price` is **required** the first time a booking moves to `CONFIRMED` if
none was set at booking time (`400` otherwise); it can also be omitted if
already set.

| From | To | Actor |
|---|---|---|
| PENDING | CONFIRMED | provider |
| PENDING | CANCELLED | customer |
| CONFIRMED | IN_PROGRESS | provider |
| CONFIRMED | CANCELLED | customer or provider |
| IN_PROGRESS | COMPLETED | provider |

**Response — `200`:** `{ "booking": { /* status (and price, if sent) updated */ } }`

**Errors:**
- `403` — `{ "error": "You are not a party to this booking." }`
- `409` — invalid transition message (same style as errands).
- `400` — `{ "error": "A price must be set when confirming this booking." }`

---

### `POST /api/cleaning-bookings/{id}/pay`

Customer-only, only once `status: COMPLETED` and a price is set. No request body.

**Response — `201`:**
```json
{
  "order": { "id": "65f1a2b3c4d5e6f7a8b9c503", "sourceType": "CLEANING_BOOKING", "sourceErrandId": null, "sourceQuotationId": null, "sourceCatalogItemId": null, "sourceCleaningBookingId": "65f1a2b3c4d5e6f7a8b9ca00", "amount": 65.0, "commissionRate": 0.2, "commissionAmount": 13.0, "payerId": "65f1a2b3c4d5e6f7a8b9c0d1", "payeeId": "65f1a2b3c4d5e6f7a8b9c0f0", "paymentStatus": "PAID", "createdAt": "...", "updatedAt": "..." },
  "payment": { "id": "65f1a2b3c4d5e6f7a8b9c603", "sourceType": "ORDER", "orderId": "65f1a2b3c4d5e6f7a8b9c503", "deliveryJobId": null, "cleaningBookingId": null, "amount": 65.0, "commissionAmount": 13.0, "deliveryFee": null, "status": "PAID", "provider": "mock", "providerRef": "mock_1d3f...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
}
```

**Errors:**
- `403` — `{ "error": "Only the customer who made this booking can pay for it." }`
- `409` — `{ "error": "A booking can only be paid once it is marked COMPLETED." }`
- `409` — `{ "error": "This booking has no price set to charge." }`
- `409` — `{ "error": "This booking has already been paid for." }`

---

## 8. Delivery jobs — `/api/delivery-jobs` (founder's own logistics arm)

Linked to *either* an errand you posted or a procurement order you paid
for — never both.

### `POST /api/delivery-jobs`

**Request body:**
```json
{
  "errandRequestId": "65f1a2b3c4d5e6f7a8b9c400",
  "pickupAddress": { "country": "United Kingdom", "state": "Greater London", "city": "London", "postalCode": "E1 6AN" },
  "dropoffAddress": { "country": "United Kingdom", "state": "Greater London", "city": "London", "postalCode": "E2 8AA" },
  "deliveryFee": 8.5,
  "scheduledAt": "2026-10-02T10:00:00Z"
}
```
Provide **exactly one** of `errandRequestId` or `relatedOrderId` (both or
neither is a `400`). If linking to an order, it must already be `PAID`.
`scheduledAt` is optional.

**Response — `201`:**
```json
{
  "job": {
    "id": "65f1a2b3c4d5e6f7a8b9cb00",
    "errandRequestId": "65f1a2b3c4d5e6f7a8b9c400",
    "relatedOrderId": null,
    "pickupAddress": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E1 6AN", "latitude": null, "longitude": null },
    "dropoffAddress": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E2 8AA", "latitude": null, "longitude": null },
    "deliveryFee": 8.5,
    "status": "REQUESTED",
    "assigneeId": null,
    "scheduledAt": "2026-10-02T10:00:00.000Z",
    "createdAt": "2026-10-01T13:50:00.000Z",
    "updatedAt": "2026-10-01T13:50:00.000Z"
  }
}
```

**Errors:**
- `400` — `{ "error": "Provide exactly one of errandRequestId or relatedOrderId." }`
- `403` — `{ "error": "Only the customer who posted this errand can request delivery for it." }` (or the order equivalent: `"Only the buyer of this order can request delivery for it."`)
- `409` — `{ "error": "A delivery job already exists for this errand." }`
- `409` — `{ "error": "Delivery can only be requested for a PAID order." }`
- `404` — errand/order not found.

---

### `GET /api/delivery-jobs`

Query params: `assignedToMe=true` (requires `RUNNER` — jobs assigned to
you) or omitted (jobs *you requested*, derived from your own errands/
orders); `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [ { "id": "65f1a2b3c4d5e6f7a8b9cb00", "errandRequestId": "...", "relatedOrderId": null, "pickupAddress": { /* ... */ }, "dropoffAddress": { /* ... */ }, "deliveryFee": 8.5, "status": "REQUESTED", "assigneeId": null, "scheduledAt": "...", "createdAt": "...", "updatedAt": "..." } ],
  "page": 1, "pageSize": 20, "total": 1
}
```

---

### `GET /api/delivery-jobs/{id}`

Requester or assignee only.

**Response — `200`:**
```json
{
  "job": { "id": "65f1a2b3c4d5e6f7a8b9cb00", "errandRequestId": "...", "relatedOrderId": null, "pickupAddress": { /* ... */ }, "dropoffAddress": { /* ... */ }, "deliveryFee": 8.5, "status": "ASSIGNED", "assigneeId": "65f1a2b3c4d5e6f7a8b9c0e5", "scheduledAt": "...", "createdAt": "...", "updatedAt": "..." },
  "payment": null
}
```
`payment` is `null` until paid — this is the one payment record not
reachable via `/api/orders`, since delivery fees carry no commission and
never become an `OrderTx`. Once paid, `payment` looks like:
```json
{ "id": "65f1a2b3c4d5e6f7a8b9c604", "sourceType": "DELIVERY_JOB", "orderId": null, "deliveryJobId": "65f1a2b3c4d5e6f7a8b9cb00", "cleaningBookingId": null, "amount": 8.5, "commissionAmount": null, "deliveryFee": 8.5, "status": "PAID", "provider": "mock", "providerRef": "mock_2a9c...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
```

**Errors:** `403` — `{ "error": "You do not have permission to view this delivery job." }`

---

### `POST /api/delivery-jobs/{id}/assign`

`RUNNER`-only self-claim of an unassigned `REQUESTED` job. No request body.

**Response — `200`:** `{ "job": { /* status: "ASSIGNED", assigneeId: you */ } }`

**Errors:**
- `409` — `{ "error": "This delivery job is no longer available for assignment." }`
- `409` — `{ "error": "This delivery job has already been assigned." }`
- `409` — `{ "error": "This delivery job was just assigned to someone else." }` (race condition)

---

### `POST /api/delivery-jobs/{id}/status`

**Request body:**
```json
{ "status": "PICKED_UP" }
```
`status` is one of `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`.

| From | To | Actor |
|---|---|---|
| REQUESTED | CANCELLED | requester |
| ASSIGNED | PICKED_UP | assignee |
| ASSIGNED | CANCELLED | requester |
| PICKED_UP | IN_TRANSIT | assignee |
| IN_TRANSIT | DELIVERED | assignee |

**Response — `200`:** `{ "job": { /* status updated */ } }`. Notifies whichever party didn't make the change.

**Errors:** `403` — `{ "error": "You are not a party to this delivery job." }` · `409` invalid-transition message.

---

### `POST /api/delivery-jobs/{id}/pay`

Requester-only, requires an assignee already set. No request body — amount
is the job's `deliveryFee`.

**Response — `201`:**
```json
{ "payment": { "id": "65f1a2b3c4d5e6f7a8b9c604", "sourceType": "DELIVERY_JOB", "orderId": null, "deliveryJobId": "65f1a2b3c4d5e6f7a8b9cb00", "cleaningBookingId": null, "amount": 8.5, "commissionAmount": null, "deliveryFee": 8.5, "status": "PAID", "provider": "mock", "providerRef": "mock_2a9c...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." } }
```
No commission — the full `deliveryFee` goes to the assignee.

**Errors:**
- `403` — `{ "error": "Only the requester of this delivery job can pay for it." }`
- `409` — `{ "error": "This delivery job has no assigned runner to pay yet." }`
- `409` — `{ "error": "This delivery job has already been charged." }`

---

## 9. Orders — `/api/orders` (transaction history, read-only)

Every `.../pay` endpoint above creates one of these; there's no direct
create endpoint here. For an aggregated earnings/spending summary instead
of a raw list, see `GET /api/account/revenue` in section 2.

### `GET /api/orders`

Query params: `role=payer` or `role=payee` (filter); omit for both. `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [ { "id": "65f1a2b3c4d5e6f7a8b9c500", "sourceType": "ERRAND", "sourceErrandId": "...", "sourceQuotationId": null, "sourceCatalogItemId": null, "sourceCleaningBookingId": null, "amount": 15.0, "commissionRate": 0.15, "commissionAmount": 2.25, "payerId": "...", "payeeId": "...", "paymentStatus": "PAID", "createdAt": "...", "updatedAt": "..." } ],
  "page": 1, "pageSize": 20, "total": 1
}
```

---

### `GET /api/orders/{id}`

Payer or payee only.

**Response — `200`:**
```json
{
  "order": { "id": "65f1a2b3c4d5e6f7a8b9c500", "sourceType": "ERRAND", "sourceErrandId": "...", "sourceQuotationId": null, "sourceCatalogItemId": null, "sourceCleaningBookingId": null, "amount": 15.0, "commissionRate": 0.15, "commissionAmount": 2.25, "payerId": "...", "payeeId": "...", "paymentStatus": "PAID", "createdAt": "...", "updatedAt": "..." },
  "payment": { "id": "65f1a2b3c4d5e6f7a8b9c600", "sourceType": "ORDER", "orderId": "65f1a2b3c4d5e6f7a8b9c500", "deliveryJobId": null, "cleaningBookingId": null, "amount": 15.0, "commissionAmount": 2.25, "deliveryFee": null, "status": "PAID", "provider": "mock", "providerRef": "mock_7e2f...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
}
```

**Errors:** `404` — `{ "error": "Order not found." }` · `403` — `{ "error": "You do not have permission to view this order." }`

---

## 10. Blog & adverts — `/api/blog`, `/api/adverts` *(public reading)*

Written by admins (see `ADMIN_API.md`); reading is open to everyone.

### `GET /api/blog` *(public)*

Query params: `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9c200", "title": "How Anyrun's commission works", "slug": "how-anyruns-commission-works", "content": "...", "coverImageUrl": null, "status": "PUBLISHED", "authorId": "...", "publishedAt": "2026-10-01T12:31:00.000Z", "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```
Only `status: PUBLISHED` posts are returned here.

### `GET /api/blog/{id}` *(public, any status)* / `GET /api/blog/slug/{slug}` *(public, PUBLISHED only)*

**Response — `200`:** `{ "post": { /* single object, same shape */ } }`

**Errors:** `404` — `{ "error": "Blog post not found." }` (the slug route also 404s for a real but unpublished slug).

### `GET /api/adverts` *(public)*

No query params. Only currently-active adverts (`isActive: true` and
within any configured `startDate`/`endDate` window).

**Response — `200`:**
```json
{
  "adverts": [
    { "id": "65f1a2b3c4d5e6f7a8b9c300", "title": "Autumn delivery promo", "imageUrl": "https://files.example.com/adverts/autumn-promo.jpg", "linkUrl": "https://anyrun.co.uk/promo/autumn", "placement": "home_banner", "startDate": "2026-10-01T00:00:00.000Z", "endDate": "2026-10-31T23:59:59.000Z", "isActive": true, "authorId": "...", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

---

## 11. Disputes — `/api/disputes`

Any authenticated account can raise one — this is how you escalate a
problem with an errand, RFQ, order, delivery, or cleaning booking.

### `POST /api/disputes`

**Request body:**
```json
{
  "relatedType": "ERRAND",
  "relatedId": "65f1a2b3c4d5e6f7a8b9c400",
  "againstId": "65f1a2b3c4d5e6f7a8b9c0e5",
  "subject": "Runner never showed up",
  "description": "Agreed pickup time was 2pm, no contact since, errand still shows ACCEPTED."
}
```
`relatedType` is one of `ERRAND`, `RFQ`, `CATALOG_ORDER`, `CLEANING_BOOKING`,
`DELIVERY_JOB`, `OTHER`. `relatedId` and `againstId` are both optional.

**Response — `201`:**
```json
{
  "dispute": {
    "id": "65f1a2b3c4d5e6f7a8b9cd00",
    "raisedById": "65f1a2b3c4d5e6f7a8b9c0d1",
    "againstId": "65f1a2b3c4d5e6f7a8b9c0e5",
    "relatedType": "ERRAND",
    "relatedId": "65f1a2b3c4d5e6f7a8b9c400",
    "subject": "Runner never showed up",
    "description": "Agreed pickup time was 2pm, no contact since, errand still shows ACCEPTED.",
    "status": "OPEN",
    "assignedToId": null,
    "resolutionNotes": null,
    "createdAt": "2026-10-01T14:00:00.000Z",
    "updatedAt": "2026-10-01T14:00:00.000Z",
    "resolvedAt": null
  }
}
```

**Errors:** `400` zod message (missing `subject`/`description`, or invalid `relatedType`).

---

### `GET /api/disputes`

Query params: `status`, `page`, `pageSize`. Without dispute-management
access, only returns disputes *you raised* — admins with that access see
everything (see `ADMIN_API.md`).

**Response — `200`:**
```json
{
  "items": [ { "id": "65f1a2b3c4d5e6f7a8b9cd00", "raisedById": "...", "againstId": "...", "relatedType": "ERRAND", "relatedId": "...", "subject": "...", "description": "...", "status": "OPEN", "assignedToId": null, "resolutionNotes": null, "createdAt": "...", "updatedAt": "...", "resolvedAt": null } ],
  "page": 1, "pageSize": 20, "total": 1
}
```

---

### `GET /api/disputes/{id}`

You (as the raiser or the named `againstId` party), or an admin.

**Response — `200`:** `{ "dispute": { /* single object */ } }`

**Errors:** `404` · `403` — `{ "error": "You do not have permission to view this dispute." }`

You'll get a `DISPUTE_UPDATE` notification whenever its status changes.

---

## 12. Notifications — `/api/notifications`

### `GET /api/notifications`

Query params: `unreadOnly=true`, `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9ce00", "recipientId": "65f1a2b3c4d5e6f7a8b9c0d1", "type": "ORDER_PAID", "title": "Payment received", "message": "A payment of 15 has been made to you (platform commission already deducted).", "relatedErrandId": null, "relatedRFQId": null, "isRead": false, "createdAt": "2026-10-01T13:00:00.000Z" }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "unreadCount": 1
}
```
`type` is one of `NEW_ERRAND_REQUEST`, `NEW_RFQ`, `QUOTATION_RECEIVED`,
`QUOTATION_ACCEPTED`, `ORDER_PAID`, `DELIVERY_UPDATE`,
`CLEANING_BOOKING_UPDATE`, `VERIFICATION_UPDATE`, `DISPUTE_UPDATE`,
`ACCOUNT_SUSPENDED`, `GENERAL` (used for e.g. "your quotation wasn't
selected"). `unreadCount` is your total unread count regardless of
`unreadOnly`/pagination.

---

### `POST /api/notifications/{id}/read`

No request body.

**Response — `200`:** `{ "notification": { /* isRead: true */ } }`

**Errors:** `404` · `403` — `{ "error": "You do not have permission to modify this notification." }`

---

### `POST /api/notifications/read-all`

No request body.

**Response — `200`:**
```json
{ "updatedCount": 3 }
```
