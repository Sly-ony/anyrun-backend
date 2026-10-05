# Anyrun — Admin API Reference (full request/response bodies)

Every admin endpoint in the project, with the exact JSON it expects and the
exact JSON it returns. For the narrative version (role hierarchy rationale,
gaps, etc.) see the git history — this document is the exhaustive reference.

## Conventions used throughout this document

**Auth header**: every endpoint below requires a valid session —
`Authorization: Bearer <token>` or the `anyrun_session` cookie set at
login/signup. Omit it → `401`:
```json
{ "error": "Authentication required." }
```

**Admin roles**: `AccountProfile.adminRole` is `SUPER_ADMIN`, `EDITOR`,
`SUPPORT`, `DEVELOPER`, or `null` (not an admin). Each endpoint states which
**capability** it requires; the mapping is:

| Capability | SUPER_ADMIN | DEVELOPER | EDITOR | SUPPORT |
|---|---|---|---|---|
| `MANAGE_ADMINS` | ✅ | ❌ | ❌ | ❌ |
| `VIEW_COMMISSION_RATES` | ✅ | ✅ | ❌ | ❌ |
| `MANAGE_COMMISSION_RATES` | ✅ | ❌ | ❌ | ❌ |
| `MANAGE_CONTENT` | ✅ | ✅ | ✅ | ❌ |
| `MANAGE_USERS` | ✅ | ✅ | ❌ | ✅ |
| `MANAGE_DISPUTES` | ✅ | ✅ | ❌ | ✅ |
| `MANAGE_JOB_CATEGORIES` | ✅ | ✅ | ❌ | ❌ |
| `MANAGE_VERIFICATIONS` | ✅ | ✅ | ❌ | ❌ |
| `VIEW_PLATFORM_DATA` | ✅ | ✅ | ❌ | ✅ |
| `VIEW_AUDIT_LOG` | ✅ | ✅ | ❌ | ❌ |

Failing a capability check → `403`:
```json
{ "error": "This action requires the MANAGE_USERS admin capability." }
```
(`requireSuperAdmin`-gated endpoints return `"This action requires the super admin role."` instead.)

**Validation errors** (bad/missing body fields) → `400`:
```json
{ "error": "A suspension reason is required." }
```

**Pagination** (list endpoints): query params `?page=1&pageSize=20` (default
page size 20, max 100), response shape:
```json
{ "items": [ /* ... */ ], "page": 1, "pageSize": 20, "total": 42 }
```

**IDs** are Postgres `cuid()` strings, not Mongo ObjectIds — the example ids
below (`"65f1a2b3c4d5e6f7a8b9c0d1"` etc.) are illustrative placeholders
only, left as 24-char hex strings for readability; real ids won't look
exactly like that. All dates are ISO-8601 strings.

**The `AccountProfile` shape**, returned in full by several endpoints below:
```json
{
  "id": "65f1a2b3c4d5e6f7a8b9c0d1",
  "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
  "roles": ["RUNNER"],
  "accountKind": "INDIVIDUAL",
  "businessName": null,
  "serviceRegions": [
    { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": "Shoreditch", "postalCode": "E1 6AN", "latitude": 51.5074, "longitude": -0.1278 }
  ],
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

**The sanitized `User` shape** (`passwordHash` and `oauthId` always stripped):
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

## 1. Admin management — `/api/admin/admins`

Capability: **`MANAGE_ADMINS`** (in practice, `requireSuperAdmin` — only
`SUPER_ADMIN` passes this check; it is not in any other role's capability
list).

### `GET /api/admin/admins`

No query params, no request body.

**Response — `200`:**
```json
{
  "admins": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c0d1",
      "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
      "roles": ["INDIVIDUAL_CUSTOMER"],
      "accountKind": "INDIVIDUAL",
      "businessName": null,
      "serviceRegions": [],
      "isActive": true,
      "adminRole": "SUPER_ADMIN",
      "jobCategoryIds": [],
      "suspensionReason": null,
      "suspendedAt": null,
      "suspendedBy": null,
      "createdAt": "2026-09-01T10:00:00.000Z",
      "updatedAt": "2026-09-01T10:00:00.000Z"
    },
    {
      "id": "65f1a2b3c4d5e6f7a8b9c0e2",
      "userId": "65f1a2b3c4d5e6f7a8b9c0e1",
      "roles": ["INDIVIDUAL_CUSTOMER"],
      "accountKind": "INDIVIDUAL",
      "businessName": null,
      "serviceRegions": [],
      "isActive": true,
      "adminRole": "EDITOR",
      "jobCategoryIds": [],
      "suspensionReason": null,
      "suspendedAt": null,
      "suspendedBy": null,
      "createdAt": "2026-09-10T09:00:00.000Z",
      "updatedAt": "2026-09-10T09:00:00.000Z"
    }
  ]
}
```
Ordered oldest-first (`createdAt asc`).

**Errors:** `401` not authenticated · `403` not a super admin.

---

### `POST /api/admin/admins`

Grants a role to an **existing** account (it must already have signed up —
this endpoint never creates a user).

**Request body:**
```json
{
  "email": "newadmin@company.co.uk",
  "role": "EDITOR"
}
```
`role` must be exactly one of `"EDITOR"`, `"SUPPORT"`, `"DEVELOPER"` —
`"SUPER_ADMIN"` is rejected by validation (400) since it isn't in that enum.

**Response — `200`:**
```json
{
  "profile": {
    "id": "65f1a2b3c4d5e6f7a8b9c0e2",
    "userId": "65f1a2b3c4d5e6f7a8b9c0e1",
    "roles": ["BUSINESS_SUPPLIER"],
    "accountKind": "BUSINESS",
    "businessName": "Acme Furnishings Ltd",
    "serviceRegions": [],
    "isActive": true,
    "adminRole": "EDITOR",
    "jobCategoryIds": [],
    "suspensionReason": null,
    "suspendedAt": null,
    "suspendedBy": null,
    "createdAt": "2026-09-10T09:00:00.000Z",
    "updatedAt": "2026-10-01T12:00:00.000Z"
  }
}
```

**Errors:**
- `400` — `{ "error": "role: Invalid enum value. Expected 'EDITOR' | 'SUPPORT' | 'DEVELOPER', received 'SUPER_ADMIN'" }` (or similar zod message) for an invalid `role`.
- `400` — `{ "error": "Cannot change the role of a super admin through this endpoint." }`
- `404` — `{ "error": "No account with that email exists yet — they must sign up first." }`
- `403` — not a super admin.

---

### `DELETE /api/admin/admins/{accountProfileId}`

No request body. `{accountProfileId}` is the target account's
`AccountProfile.id` (not `userId`, not email).

**Response — `200`:**
```json
{
  "profile": {
    "id": "65f1a2b3c4d5e6f7a8b9c0e2",
    "userId": "65f1a2b3c4d5e6f7a8b9c0e1",
    "roles": ["BUSINESS_SUPPLIER"],
    "accountKind": "BUSINESS",
    "businessName": "Acme Furnishings Ltd",
    "serviceRegions": [],
    "isActive": true,
    "adminRole": null,
    "jobCategoryIds": [],
    "suspensionReason": null,
    "suspendedAt": null,
    "suspendedBy": null,
    "createdAt": "2026-09-10T09:00:00.000Z",
    "updatedAt": "2026-10-01T12:05:00.000Z"
  }
}
```

**Errors:**
- `404` — `{ "error": "Account not found." }`
- `400` — `{ "error": "This account has no admin role to revoke." }`
- `400` — `{ "error": "Cannot revoke a super admin through this endpoint." }`
- `403` — not a super admin.

---

## 2. Commission rates — `/api/admin/commission-rates`

### `GET /api/admin/commission-rates`

Capability: **`VIEW_COMMISSION_RATES`** (`SUPER_ADMIN`, `DEVELOPER`).
No request body.

**Response — `200`:**
```json
{
  "rates": [
    { "sourceType": "ERRAND", "rate": 0.15, "source": "env_default", "updatedAt": null, "updatedBy": null },
    { "sourceType": "RFQ_QUOTATION", "rate": 0.12, "source": "database_override", "updatedAt": "2026-09-15T08:00:00.000Z", "updatedBy": "65f1a2b3c4d5e6f7a8b9c0d1" },
    { "sourceType": "CATALOG_PURCHASE", "rate": 0.1, "source": "env_default", "updatedAt": null, "updatedBy": null },
    { "sourceType": "CLEANING_BOOKING", "rate": 0.2, "source": "env_default", "updatedAt": null, "updatedBy": null }
  ]
}
```
`source` is `"database_override"` when a `CommissionRate` row exists for
that `sourceType`, else `"env_default"` (read from `COMMISSION_RATE_*` env
vars — see `lib/commission.ts`).

**Errors:** `401` · `403` (`"This action requires the VIEW_COMMISSION_RATES admin capability."`).

---

### `PATCH /api/admin/commission-rates/{sourceType}`

Capability: **`MANAGE_COMMISSION_RATES`** (`SUPER_ADMIN` only — this is the
one endpoint `DEVELOPER` is explicitly blocked from).

`{sourceType}` is one of `ERRAND`, `RFQ_QUOTATION`, `CATALOG_PURCHASE`,
`CLEANING_BOOKING`.

**Request body:**
```json
{ "rate": 0.12 }
```
`rate` must be a number between `0` and `1` inclusive (it's a fraction of
the transaction amount, not a percentage — `0.12` = 12%).

**Response — `200`** (the raw `CommissionRate` row, upserted):
```json
{
  "rate": {
    "id": "65f1a2b3c4d5e6f7a8b9c0f1",
    "sourceType": "RFQ_QUOTATION",
    "rate": 0.12,
    "updatedBy": "65f1a2b3c4d5e6f7a8b9c0d1",
    "updatedAt": "2026-10-01T12:10:00.000Z"
  }
}
```
Note the response key is `"rate"` wrapping the *entire* `CommissionRate`
record (which itself also has a numeric `rate` field inside it) — i.e. the
value is `response.rate.rate`, not `response.rate` directly.

**Errors:**
- `400` — `{ "error": "Invalid sourceType. Must be one of: ERRAND, RFQ_QUOTATION, CATALOG_PURCHASE, CLEANING_BOOKING." }`
- `400` — `{ "error": "Rate is a fraction of the transaction, e.g. 0.15 for 15%." }` (if `rate` is outside 0–1, or missing/non-numeric gets a generic zod message)
- `403` — `{ "error": "This action requires the MANAGE_COMMISSION_RATES admin capability." }` (this is what a `DEVELOPER` gets)

---

## 3. Verification review — `/api/admin/verifications`

Capability: **`MANAGE_VERIFICATIONS`** (`SUPER_ADMIN`, `DEVELOPER`).

### `GET /api/admin/verifications`

Query params (all optional): `status` (default `"PENDING"`; pass `"ALL"`
for every status), `type` (`"BUSINESS"` or `"JOB_CATEGORY"`), `page`,
`pageSize`. No request body.

**Response — `200`:**
```json
{
  "items": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c100",
      "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0e2",
      "type": "BUSINESS",
      "jobCategoryId": null,
      "status": "PENDING",
      "documents": ["https://files.example.com/certificate-of-incorporation.pdf"],
      "notes": null,
      "rejectionReason": null,
      "reviewedBy": null,
      "submittedAt": "2026-09-28T14:00:00.000Z",
      "reviewedAt": null
    },
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
      "submittedAt": "2026-09-29T09:00:00.000Z",
      "reviewedAt": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 2
}
```
Ordered oldest-first (`submittedAt asc`) — oldest pending review surfaces first.

**Errors:** `401` · `403`.

---

### `POST /api/admin/verifications/{id}/review`

**Request body — approve:**
```json
{ "decision": "APPROVED" }
```

**Request body — reject:**
```json
{
  "decision": "REJECTED",
  "rejectionReason": "The uploaded certificate photo is illegible — please resubmit a clearer scan."
}
```
`rejectionReason` is **required** when `decision` is `"REJECTED"` (zod
`.refine` enforces this — omitting it is a `400`, not silently accepted).

**Response — `200`:**
```json
{
  "verification": {
    "id": "65f1a2b3c4d5e6f7a8b9c100",
    "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0e2",
    "type": "BUSINESS",
    "jobCategoryId": null,
    "status": "APPROVED",
    "documents": ["https://files.example.com/certificate-of-incorporation.pdf"],
    "notes": null,
    "rejectionReason": null,
    "reviewedBy": "65f1a2b3c4d5e6f7a8b9c0d1",
    "submittedAt": "2026-09-28T14:00:00.000Z",
    "reviewedAt": "2026-10-01T12:15:00.000Z"
  }
}
```
On rejection, `status: "REJECTED"` and `rejectionReason` is populated
instead of `null`. Either way, the submitter gets a `VERIFICATION_UPDATE`
notification (see `lib/notificationService.ts`'s `notifyVerificationReviewed`).

**Errors:**
- `404` — `{ "error": "Verification not found." }`
- `409` — `{ "error": "Only a PENDING verification can be reviewed." }` (already decided once)
- `400` — `{ "error": "rejectionReason is required when rejecting a verification." }`
- `403` — not `SUPER_ADMIN`/`DEVELOPER`.

---

## 4. Job categories — `/api/job-categories`

`GET` is public (no auth). `POST`/`PATCH` require capability
**`MANAGE_JOB_CATEGORIES`** (`SUPER_ADMIN`, `DEVELOPER`).

### `GET /api/job-categories` *(public)*

No request body.

**Response — `200`:**
```json
{
  "categories": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c0d2",
      "name": "Furniture moving",
      "description": "Lifting and transporting furniture, including into/out of vehicles.",
      "requiresVerification": true,
      "isActive": true,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-01T00:00:00.000Z"
    },
    {
      "id": "65f1a2b3c4d5e6f7a8b9c0d3",
      "name": "Grocery pickup",
      "description": null,
      "requiresVerification": false,
      "isActive": true,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-01T00:00:00.000Z"
    }
  ]
}
```
Only `isActive: true` categories are returned, alphabetical by `name`.

---

### `POST /api/job-categories`

**Request body:**
```json
{
  "name": "Pet sitting",
  "description": "In-home pet care while the owner is away.",
  "requiresVerification": true
}
```
`description` and `requiresVerification` are optional (`requiresVerification` defaults to `false`).

**Response — `201`:**
```json
{
  "category": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d4",
    "name": "Pet sitting",
    "description": "In-home pet care while the owner is away.",
    "requiresVerification": true,
    "isActive": true,
    "createdAt": "2026-10-01T12:20:00.000Z",
    "updatedAt": "2026-10-01T12:20:00.000Z"
  }
}
```

**Errors:**
- `409` — `{ "error": "A job category with this name already exists." }`
- `400` — zod message if `name` is missing/empty.
- `403` — not `SUPER_ADMIN`/`DEVELOPER`.

---

### `PATCH /api/job-categories/{id}`

**Request body** (all fields optional — send only what's changing):
```json
{ "requiresVerification": false }
```
or
```json
{ "name": "Pet sitting & walking", "description": "Updated scope.", "isActive": true }
```

**Response — `200`:**
```json
{
  "category": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d4",
    "name": "Pet sitting",
    "description": "In-home pet care while the owner is away.",
    "requiresVerification": false,
    "isActive": true,
    "createdAt": "2026-10-01T12:20:00.000Z",
    "updatedAt": "2026-10-01T12:25:00.000Z"
  }
}
```

**Errors:**
- `404` — `{ "error": "Job category not found." }`
- `409` — `{ "error": "A job category with this name already exists." }` (renaming into a clash)
- `403` — not `SUPER_ADMIN`/`DEVELOPER`.

*(There's also a public `GET /api/job-categories/{id}` returning `{ "category": {...} }` or `404` — same shape as one list item.)*

---

## 5. Content — blog & adverts

Capability for all writes below: **`MANAGE_CONTENT`** (`SUPER_ADMIN`,
`DEVELOPER`, `EDITOR`). Reads are public.

### `POST /api/blog`

**Request body:**
```json
{
  "title": "How Anyrun's commission works",
  "slug": "how-anyruns-commission-works",
  "content": "Full post body, markdown or HTML as your frontend expects...",
  "coverImageUrl": "https://files.example.com/blog/commission-cover.jpg",
  "status": "DRAFT"
}
```
`coverImageUrl` is optional. `status` is optional, defaults to `"DRAFT"`;
pass `"PUBLISHED"` to publish immediately. `slug` must be lowercase,
alphanumeric, hyphen-separated (e.g. `how-anyruns-commission-works`) —
anything else is a `400`.

**Response — `201`:**
```json
{
  "post": {
    "id": "65f1a2b3c4d5e6f7a8b9c200",
    "title": "How Anyrun's commission works",
    "slug": "how-anyruns-commission-works",
    "content": "Full post body...",
    "coverImageUrl": "https://files.example.com/blog/commission-cover.jpg",
    "status": "DRAFT",
    "authorId": "65f1a2b3c4d5e6f7a8b9c0e2",
    "publishedAt": null,
    "createdAt": "2026-10-01T12:30:00.000Z",
    "updatedAt": "2026-10-01T12:30:00.000Z"
  }
}
```
If `status: "PUBLISHED"` was sent, `publishedAt` is set to the current time
instead of `null`.

**Errors:**
- `409` — `{ "error": "A blog post with this slug already exists." }`
- `400` — zod message for a bad slug/missing title/content.
- `403` — missing `MANAGE_CONTENT`.

---

### `GET /api/blog` *(public)*

Query params: `page`, `pageSize`; `status=DRAFT` to see drafts (requires
`MANAGE_CONTENT` — `403` otherwise). No request body.

**Response — `200`:**
```json
{
  "items": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c200",
      "title": "How Anyrun's commission works",
      "slug": "how-anyruns-commission-works",
      "content": "Full post body...",
      "coverImageUrl": "https://files.example.com/blog/commission-cover.jpg",
      "status": "PUBLISHED",
      "authorId": "65f1a2b3c4d5e6f7a8b9c0e2",
      "publishedAt": "2026-10-01T12:31:00.000Z",
      "createdAt": "2026-10-01T12:30:00.000Z",
      "updatedAt": "2026-10-01T12:31:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

---

### `GET /api/blog/{id}` *(public, any status)* / `GET /api/blog/slug/{slug}` *(public, PUBLISHED only)*

No request body.

**Response — `200`** (single post, same shape as a list item):
```json
{ "post": { "id": "65f1a2b3c4d5e6f7a8b9c200", "title": "...", "slug": "...", "content": "...", "coverImageUrl": null, "status": "PUBLISHED", "authorId": "...", "publishedAt": "...", "createdAt": "...", "updatedAt": "..." } }
```

**Errors:** `404` — `{ "error": "Blog post not found." }` (the slug route
also 404s for a real but unpublished slug, so drafts aren't guessable).

---

### `DELETE /api/blog/{id}`

No request body.

**Response — `200`:**
```json
{ "success": true }
```
Hard delete — no soft-delete/undo.

**Errors:** `404` — `{ "error": "Blog post not found." }` · `403`.

---

### `POST /api/adverts`

**Request body:**
```json
{
  "title": "Autumn delivery promo",
  "imageUrl": "https://files.example.com/adverts/autumn-promo.jpg",
  "linkUrl": "https://anyrun.co.uk/promo/autumn",
  "placement": "home_banner",
  "startDate": "2026-10-01T00:00:00Z",
  "endDate": "2026-10-31T23:59:59Z",
  "isActive": true
}
```
Only `title` and `imageUrl` are required; everything else is optional
(`isActive` defaults to `true`). `placement` is free text — no fixed
taxonomy.

**Response — `201`:**
```json
{
  "advert": {
    "id": "65f1a2b3c4d5e6f7a8b9c300",
    "title": "Autumn delivery promo",
    "imageUrl": "https://files.example.com/adverts/autumn-promo.jpg",
    "linkUrl": "https://anyrun.co.uk/promo/autumn",
    "placement": "home_banner",
    "startDate": "2026-10-01T00:00:00.000Z",
    "endDate": "2026-10-31T23:59:59.000Z",
    "isActive": true,
    "authorId": "65f1a2b3c4d5e6f7a8b9c0e2",
    "createdAt": "2026-10-01T12:35:00.000Z",
    "updatedAt": "2026-10-01T12:35:00.000Z"
  }
}
```

**Errors:** `400` zod message (e.g. missing/invalid `imageUrl`) · `403`.

---

### `GET /api/adverts` *(public)*

No query params, no request body. Only returns adverts where `isActive:
true` **and** the current time falls inside `startDate`/`endDate` (an unset
bound means no limit on that side).

**Response — `200`:**
```json
{
  "adverts": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c300",
      "title": "Autumn delivery promo",
      "imageUrl": "https://files.example.com/adverts/autumn-promo.jpg",
      "linkUrl": "https://anyrun.co.uk/promo/autumn",
      "placement": "home_banner",
      "startDate": "2026-10-01T00:00:00.000Z",
      "endDate": "2026-10-31T23:59:59.000Z",
      "isActive": true,
      "authorId": "65f1a2b3c4d5e6f7a8b9c0e2",
      "createdAt": "2026-10-01T12:35:00.000Z",
      "updatedAt": "2026-10-01T12:35:00.000Z"
    }
  ]
}
```

---

### `DELETE /api/adverts/{id}`

No request body.

**Response — `200`:**
```json
{ "success": true }
```

**Errors:** `404` — `{ "error": "Advert post not found." }` · `403`.

---

## 6. Users — `/api/admin/users`

Capability: **`MANAGE_USERS`** (`SUPER_ADMIN`, `DEVELOPER`, `SUPPORT`).

### `GET /api/admin/users`

Query params (all optional): `page`, `pageSize`, `suspended=true` (only
suspended accounts), `email=<partial, case-insensitive>`. No request body.

**Response — `200`:**
```json
{
  "items": [
    {
      "user": {
        "id": "65f1a2b3c4d5e6f7a8b9c0d0",
        "email": "jane@example.co.uk",
        "phone": "+447700900000",
        "oauthProvider": null,
        "name": "Jane Doe",
        "avatarUrl": null,
        "createdAt": "2026-09-01T10:00:00.000Z",
        "updatedAt": "2026-09-01T10:00:00.000Z"
      },
      "profile": {
        "id": "65f1a2b3c4d5e6f7a8b9c0d1",
        "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
        "roles": ["RUNNER"],
        "accountKind": "INDIVIDUAL",
        "businessName": null,
        "serviceRegions": [],
        "isActive": true,
        "adminRole": null,
        "jobCategoryIds": [],
        "suspensionReason": null,
        "suspendedAt": null,
        "suspendedBy": null,
        "createdAt": "2026-09-01T10:00:00.000Z",
        "updatedAt": "2026-09-01T10:00:00.000Z"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```
Each item pairs `user` (sanitized) with its `profile`. Newest accounts first.

**Errors:** `401` · `403`.

---

### `GET /api/admin/users/{id}`

`{id}` is the target's `AccountProfile.id`. No request body.

**Response — `200`:**
```json
{
  "user": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d0",
    "email": "jane@example.co.uk",
    "phone": "+447700900000",
    "oauthProvider": null,
    "name": "Jane Doe",
    "avatarUrl": null,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z"
  },
  "profile": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "userId": "65f1a2b3c4d5e6f7a8b9c0d0",
    "roles": ["RUNNER"],
    "accountKind": "INDIVIDUAL",
    "businessName": null,
    "serviceRegions": [],
    "isActive": true,
    "adminRole": null,
    "jobCategoryIds": [],
    "suspensionReason": null,
    "suspendedAt": null,
    "suspendedBy": null,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-01T10:00:00.000Z"
  }
}
```

**Errors:** `404` — `{ "error": "Account not found." }` · `403`.

---

### `POST /api/admin/users/{id}/suspend`

**Request body:**
```json
{ "reason": "Repeated no-shows on accepted errands after three warnings." }
```
`reason` is required and must be non-empty.

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
    "isActive": false,
    "adminRole": null,
    "jobCategoryIds": [],
    "suspensionReason": "Repeated no-shows on accepted errands after three warnings.",
    "suspendedAt": "2026-10-01T12:40:00.000Z",
    "suspendedBy": "65f1a2b3c4d5e6f7a8b9c0f9",
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-10-01T12:40:00.000Z"
  }
}
```
`isActive` becomes `false`, which immediately blocks the account from every
authenticated endpoint (`requireAuth` checks `isActive` on every request —
there's no partial/soft suspension). The user also gets an
`ACCOUNT_SUSPENDED` notification recorded (unreadable by them until
reinstated, since reading notifications itself requires a valid session).

**Errors:**
- `404` — `{ "error": "Account not found." }`
- `409` — `{ "error": "This account is already suspended." }`
- `400` — `{ "error": "Admin accounts cannot be suspended through this endpoint." }`
- `400` — `{ "error": "A suspension reason is required." }` (empty/missing `reason`)
- `403` — missing `MANAGE_USERS`.

---

### `POST /api/admin/users/{id}/reinstate`

No request body.

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
    "jobCategoryIds": [],
    "suspensionReason": null,
    "suspendedAt": null,
    "suspendedBy": null,
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-10-01T13:00:00.000Z"
  }
}
```

**Errors:**
- `404` — `{ "error": "Account not found." }`
- `409` — `{ "error": "This account is not currently suspended." }`
- `403` — missing `MANAGE_USERS`.

---

## 7. Disputes — `/api/disputes`

Raising a dispute (`POST`) needs **no special capability** — any
authenticated account can file one. Viewing/managing everyone else's
disputes needs **`MANAGE_DISPUTES`** (`SUPER_ADMIN`, `DEVELOPER`, `SUPPORT`).

### `POST /api/disputes` *(any authenticated account)*

**Request body:**
```json
{
  "relatedType": "ERRAND",
  "relatedId": "65f1a2b3c4d5e6f7a8b9c400",
  "againstId": "65f1a2b3c4d5e6f7a8b9c0d1",
  "subject": "Runner never showed up",
  "description": "Agreed pickup time was 2pm, no contact since, errand still shows ACCEPTED."
}
```
`relatedType` is one of `ERRAND`, `RFQ`, `CATALOG_ORDER`,
`CLEANING_BOOKING`, `DELIVERY_JOB`, `OTHER`. `relatedId` and `againstId` are
both optional (omit `relatedId` for `OTHER`, or when there's no specific
record; omit `againstId` when there's no other party to name). `subject`
and `description` are required.

**Response — `201`:**
```json
{
  "dispute": {
    "id": "65f1a2b3c4d5e6f7a8b9c500",
    "raisedById": "65f1a2b3c4d5e6f7a8b9c0e5",
    "againstId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "relatedType": "ERRAND",
    "relatedId": "65f1a2b3c4d5e6f7a8b9c400",
    "subject": "Runner never showed up",
    "description": "Agreed pickup time was 2pm, no contact since, errand still shows ACCEPTED.",
    "status": "OPEN",
    "assignedToId": null,
    "resolutionNotes": null,
    "createdAt": "2026-10-01T13:05:00.000Z",
    "updatedAt": "2026-10-01T13:05:00.000Z",
    "resolvedAt": null
  }
}
```

**Errors:** `400` zod message (missing `subject`/`description`, or invalid `relatedType`) · `401`.

---

### `GET /api/disputes`

Query params: `status` (filter — `OPEN`, `IN_REVIEW`, `RESOLVED`,
`DISMISSED`), `page`, `pageSize`. No request body. **Without**
`MANAGE_DISPUTES`, this only returns disputes *you raised*; **with** it, every
dispute platform-wide.

**Response — `200`** (as a regular user, seeing only your own):
```json
{
  "items": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c500",
      "raisedById": "65f1a2b3c4d5e6f7a8b9c0e5",
      "againstId": "65f1a2b3c4d5e6f7a8b9c0d1",
      "relatedType": "ERRAND",
      "relatedId": "65f1a2b3c4d5e6f7a8b9c400",
      "subject": "Runner never showed up",
      "description": "Agreed pickup time was 2pm, no contact since, errand still shows ACCEPTED.",
      "status": "OPEN",
      "assignedToId": null,
      "resolutionNotes": null,
      "createdAt": "2026-10-01T13:05:00.000Z",
      "updatedAt": "2026-10-01T13:05:00.000Z",
      "resolvedAt": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

**Errors:** `401`.

---

### `GET /api/disputes/{id}`

Accessible to the raiser, the named `againstId` party, or an admin with
`MANAGE_DISPUTES`. No request body.

**Response — `200`** (same single-object shape as a list item):
```json
{ "dispute": { "id": "65f1a2b3c4d5e6f7a8b9c500", "raisedById": "...", "againstId": "...", "relatedType": "ERRAND", "relatedId": "...", "subject": "...", "description": "...", "status": "OPEN", "assignedToId": null, "resolutionNotes": null, "createdAt": "...", "updatedAt": "...", "resolvedAt": null } }
```

**Errors:**
- `404` — `{ "error": "Dispute not found." }`
- `403` — `{ "error": "You do not have permission to view this dispute." }`

---

### `POST /api/disputes/{id}/manage`

Capability: **`MANAGE_DISPUTES`**.

**Request body — move to review:**
```json
{ "status": "IN_REVIEW" }
```

**Request body — resolve:**
```json
{
  "status": "RESOLVED",
  "resolutionNotes": "Confirmed with both parties; refunded the customer manually via bank transfer.",
  "assignedToId": "65f1a2b3c4d5e6f7a8b9c0f9"
}
```
`resolutionNotes` is **required** when `status` is `"RESOLVED"` or
`"DISMISSED"` (both terminal) — omitting it is a `400`. `assignedToId` is
always optional (an admin's `AccountProfile.id`).

**Response — `200`:**
```json
{
  "dispute": {
    "id": "65f1a2b3c4d5e6f7a8b9c500",
    "raisedById": "65f1a2b3c4d5e6f7a8b9c0e5",
    "againstId": "65f1a2b3c4d5e6f7a8b9c0d1",
    "relatedType": "ERRAND",
    "relatedId": "65f1a2b3c4d5e6f7a8b9c400",
    "subject": "Runner never showed up",
    "description": "Agreed pickup time was 2pm, no contact since, errand still shows ACCEPTED.",
    "status": "RESOLVED",
    "assignedToId": "65f1a2b3c4d5e6f7a8b9c0f9",
    "resolutionNotes": "Confirmed with both parties; refunded the customer manually via bank transfer.",
    "createdAt": "2026-10-01T13:05:00.000Z",
    "updatedAt": "2026-10-01T13:20:00.000Z",
    "resolvedAt": "2026-10-01T13:20:00.000Z"
  }
}
```
`resolvedAt` is only set when the new `status` is `RESOLVED` or `DISMISSED`.
The raiser gets a `DISPUTE_UPDATE` notification on every call to this
endpoint, worded differently for a terminal vs. non-terminal status change.

**Errors:**
- `404` — `{ "error": "Dispute not found." }`
- `409` — `{ "error": "This dispute is already RESOLVED." }` (or `DISMISSED` — already terminal, can't be managed again)
- `400` — `{ "error": "resolutionNotes is required when resolving or dismissing a dispute." }`
- `403` — missing `MANAGE_DISPUTES`.

---

## 8. Platform data — errands, orders, RFQs, catalog, cleaning, delivery, revenue, deposits, withdrawals

Covers `/api/admin/errands`, `/api/admin/orders`, `/api/admin/rfqs`,
`/api/admin/quotations`, `/api/admin/catalog`, `/api/admin/cleaning-bookings`,
`/api/admin/delivery-jobs`, `/api/admin/revenue`, `/api/admin/deposits`,
`/api/admin/withdrawals`. Capability: **`VIEW_PLATFORM_DATA`** (`SUPER_ADMIN`,
`DEVELOPER`, `SUPPORT` — `SUPPORT` has it specifically so resolving a
dispute doesn't dead-end at an id it can't look up). Read-only — there's no
`MANAGE_` counterpart yet (see "Remaining known gaps" below).

### `GET /api/admin/errands`

Platform-wide errand list — unlike the user-facing `GET /api/errands`,
this isn't scoped to "mine"/"assignedToMe"/open-only. Query params (all
optional): `status`, `category`, `customerId`, `runnerId`, `state`, `city`,
`page`, `pageSize`. No request body.

**Response — `200`:**
```json
{
  "items": [
    {
      "id": "65f1a2b3c4d5e6f7a8b9c400",
      "customerId": "65f1a2b3c4d5e6f7a8b9c0d1",
      "description": "Pick up a parcel from the post office and drop it at my flat",
      "category": "delivery",
      "location": { "country": "United Kingdom", "state": "Greater London", "city": "London", "area": null, "postalCode": "E1 6AN", "latitude": null, "longitude": null },
      "budget": 15.0,
      "photos": [],
      "deadline": "2026-10-02T17:00:00.000Z",
      "status": "COMPLETED",
      "runnerId": "65f1a2b3c4d5e6f7a8b9c0e5",
      "createdAt": "2026-10-01T12:00:00.000Z",
      "updatedAt": "2026-10-01T13:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```
There's no separate admin detail route for a single errand — `GET
/api/errands/{id}` (see `USER_API.md`) is already open to any authenticated
account, admins included.

**Errors:** `401` · `403` — `{ "error": "This action requires the VIEW_PLATFORM_DATA admin capability." }`

---

### `GET /api/admin/rfqs`

Platform-wide RFQ list — unlike `GET /api/rfqs`, not scoped to the buyer's
own or the open/region-scoped supplier feed. Query params (all optional):
`status`, `buyerId`, `state`, `city`, `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9c700", "buyerId": "65f1a2b3c4d5e6f7a8b9c0e2", "title": "Furnishing a 3-bed flat", "lineItems": [{ "itemId": "a1b2c3d4-...", "name": "Fridge freezer", "quantity": 1, "notes": null }], "region": { "country": "United Kingdom", "state": "Greater London", "city": "London" }, "deadline": "2026-10-20T00:00:00.000Z", "status": "AWARDED", "awardedQuotationId": "65f1a2b3c4d5e6f7a8b9c800", "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```

### `GET /api/admin/rfqs/{id}`

RFQ detail **plus every quotation against it** — the user-facing
`GET /api/rfqs/{id}` only shows the full quotation list to the RFQ's own
buyer (a supplier sees just their own, anyone else sees none). This is the
admin bypass.

**Response — `200`:**
```json
{
  "rfq": { "id": "65f1a2b3c4d5e6f7a8b9c700", "buyerId": "...", "title": "...", "lineItems": [ /* ... */ ], "region": { /* ... */ }, "deadline": "...", "status": "AWARDED", "awardedQuotationId": "65f1a2b3c4d5e6f7a8b9c800", "createdAt": "...", "updatedAt": "..." },
  "quotations": [
    { "id": "65f1a2b3c4d5e6f7a8b9c800", "rfqId": "65f1a2b3c4d5e6f7a8b9c700", "supplierId": "65f1a2b3c4d5e6f7a8b9c0e5", "lineItems": [ /* ... */ ], "totalPrice": 450.0, "notes": "...", "status": "ACCEPTED", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

**Errors:** `404` — `{ "error": "RFQ not found." }`

### `GET /api/admin/quotations/{id}`

Standalone quotation detail — for when you have a quotation id directly
(e.g. surfaced via a dispute) without wanting to look up its parent RFQ
first.

**Response — `200`:** `{ "quotation": { /* same shape as above */ } }`

**Errors:** `404` — `{ "error": "Quotation not found." }`

---

### `GET /api/admin/catalog`

Platform-wide catalog list — unlike `GET /api/catalog`, includes hidden
(`isAvailable: false`) listings and isn't scoped to one supplier's own.
Query params (all optional): `supplierId`, `category`, `isAvailable`
(`"true"`/`"false"` — omit to see both), `state`, `city`, `page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9c900", "supplierId": "65f1a2b3c4d5e6f7a8b9c0e5", "title": "3-seater grey fabric sofa", "description": "...", "category": "furniture", "price": 250.0, "currency": "GBP", "photos": [], "region": { /* ... */ }, "isAvailable": true, "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```

(No separate admin detail route — `GET /api/catalog/{id}` is already
public.)

---

### `GET /api/admin/cleaning-bookings`

Platform-wide list. Query params (all optional): `status`, `customerId`,
`serviceScope` (`DOMESTIC`/`COMMERCIAL`), `page`, `pageSize`. There's no
`providerId` filter — there's only ever the one seeded provider.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9ca00", "customerId": "...", "providerId": "...", "serviceScope": "DOMESTIC", "address": { /* ... */ }, "scheduledDate": "...", "notes": "...", "price": 60.0, "status": "COMPLETED", "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```

### `GET /api/admin/cleaning-bookings/{id}`

Detail bypass — the user-facing `GET /api/cleaning-bookings/{id}` 403s
anyone who isn't the booking's customer or the provider.

**Response — `200`:** `{ "booking": { /* same shape as above */ } }`

**Errors:** `404` — `{ "error": "Cleaning booking not found." }`

---

### `GET /api/admin/delivery-jobs`

Platform-wide list. Query params (all optional): `status`, `assigneeId`,
`page`, `pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9cb00", "errandRequestId": "...", "relatedOrderId": null, "pickupAddress": { /* ... */ }, "dropoffAddress": { /* ... */ }, "deliveryFee": 8.5, "status": "DELIVERED", "assigneeId": "65f1a2b3c4d5e6f7a8b9c0e5", "scheduledAt": "...", "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```

### `GET /api/admin/delivery-jobs/{id}`

Detail bypass, including its `Payment` — same reasoning as
`GET /api/admin/orders/{id}`: delivery fee payments never become an
`OrderTx` (no commission), so this is the only admin route that can see one
for a job the admin isn't a party to.

**Response — `200`:**
```json
{
  "job": { "id": "65f1a2b3c4d5e6f7a8b9cb00", "errandRequestId": "...", "relatedOrderId": null, "pickupAddress": { /* ... */ }, "dropoffAddress": { /* ... */ }, "deliveryFee": 8.5, "status": "DELIVERED", "assigneeId": "...", "scheduledAt": "...", "createdAt": "...", "updatedAt": "..." },
  "payment": { "id": "...", "sourceType": "DELIVERY_JOB", "orderId": null, "deliveryJobId": "65f1a2b3c4d5e6f7a8b9cb00", "cleaningBookingId": null, "amount": 8.5, "commissionAmount": null, "deliveryFee": 8.5, "status": "PAID", "provider": "mock", "providerRef": "...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
}
```

**Errors:** `404` — `{ "error": "Delivery job not found." }`

---

### `GET /api/admin/orders`

Platform-wide order list — unlike `GET /api/orders`, not scoped to
payer/payee. Query params (all optional): `sourceType`
(`ERRAND`/`RFQ_QUOTATION`/`CATALOG_PURCHASE`/`CLEANING_BOOKING`),
`paymentStatus` (`PENDING`/`PAID`/`FAILED`/`REFUNDED`), `payerId`,
`payeeId`, `startDate`, `endDate` (both filter on `createdAt`), `page`,
`pageSize`. No request body.

**Response — `200`:**
```json
{
  "items": [
    {
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
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

**Errors:** same as above.

---

### `GET /api/admin/orders/{id}`

The admin bypass for order detail — the user-facing `GET /api/orders/{id}`
403s anyone who isn't the payer or payee, which includes admins by design
(that route has no concept of admin capabilities). No request body.

**Response — `200`:**
```json
{
  "order": { "id": "65f1a2b3c4d5e6f7a8b9c500", "sourceType": "ERRAND", "sourceErrandId": "65f1a2b3c4d5e6f7a8b9c400", "sourceQuotationId": null, "sourceCatalogItemId": null, "sourceCleaningBookingId": null, "amount": 15.0, "commissionRate": 0.15, "commissionAmount": 2.25, "payerId": "65f1a2b3c4d5e6f7a8b9c0d1", "payeeId": "65f1a2b3c4d5e6f7a8b9c0e5", "paymentStatus": "PAID", "createdAt": "...", "updatedAt": "..." },
  "payment": { "id": "65f1a2b3c4d5e6f7a8b9c600", "sourceType": "ORDER", "orderId": "65f1a2b3c4d5e6f7a8b9c500", "deliveryJobId": null, "cleaningBookingId": null, "amount": 15.0, "commissionAmount": 2.25, "deliveryFee": null, "status": "PAID", "provider": "mock", "providerRef": "mock_7e2f...", "paidAt": "...", "createdAt": "...", "updatedAt": "..." }
}
```
`payment` is `null` if the order was never successfully charged (e.g. still
`PENDING`).

**Errors:** `404` — `{ "error": "Order not found." }` · `403`.

*(There is no equivalent admin bypass for `DeliveryJob` payments — see
"Remaining known gaps" below.)*

---

### `GET /api/admin/revenue`

Platform commission revenue summary. Query params (all optional):
`startDate`, `endDate` (filter `OrderTx.createdAt`/`Payment.createdAt`),
`paymentStatus` (defaults to `"PAID"` — pass `"ALL"` to include
`PENDING`/`FAILED` orders in the counts too). No request body.

**Response — `200`:**
```json
{
  "range": { "startDate": "2026-09-01T00:00:00.000Z", "endDate": "2026-10-01T00:00:00.000Z" },
  "paymentStatusFilter": "PAID",
  "totals": { "orderCount": 42, "grossAmount": 12500.0, "commissionAmount": 1875.0 },
  "bySourceType": [
    { "sourceType": "ERRAND", "orderCount": 20, "grossAmount": 5000.0, "commissionAmount": 750.0 },
    { "sourceType": "RFQ_QUOTATION", "orderCount": 8, "grossAmount": 4000.0, "commissionAmount": 400.0 },
    { "sourceType": "CATALOG_PURCHASE", "orderCount": 10, "grossAmount": 2500.0, "commissionAmount": 250.0 },
    { "sourceType": "CLEANING_BOOKING", "orderCount": 4, "grossAmount": 1000.0, "commissionAmount": 200.0 }
  ],
  "deliveryFees": { "jobCount": 6, "totalAmount": 51.0 }
}
```
`totals` and `bySourceType[].commissionAmount` are what actually matters as
"revenue" — the platform's cut. `deliveryFees` is reported **separately and
not included in `totals`**, since delivery fees carry no commission (the
full amount goes to the delivery company, per the business rule that
delivery fees are "a separate, additional charge, not part of the
commission calculation") — it's shown purely for payment-volume visibility,
not as platform income. `grossAmount` per source type is the sum of
`OrderTx.amount` (what payers paid in total, commission included); the
payee's actual take-home for that bucket is `grossAmount - commissionAmount`.

**Errors:** `401` · `403`.

---

### `GET /api/admin/deposits`

Platform-wide deposit list. Query params (all optional): `status`
(`PENDING`/`COMPLETED`/`FAILED`), `provider` (`PAYSTACK`/`FLUTTERWAVE`),
`accountProfileId`, `page`, `pageSize`. No request body.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9d200", "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0d1", "provider": "FLUTTERWAVE", "amount": 50.0, "currency": "GBP", "status": "COMPLETED", "reference": "dep_3f2a1c9e-...", "providerReference": "7654321", "checkoutUrl": "https://checkout.flutterwave.com/...", "paidAt": "2026-10-02T09:12:00.000Z", "createdAt": "2026-10-02T09:10:00.000Z", "updatedAt": "2026-10-02T09:12:00.000Z" }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```

**Errors:** `401` · `403`.

---

### `GET /api/admin/withdrawals`

Platform-wide withdrawal list. Same query params as deposits, with `status`
one of `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`. No request body.

**Response — `200`:**
```json
{
  "items": [
    { "id": "65f1a2b3c4d5e6f7a8b9d300", "accountProfileId": "65f1a2b3c4d5e6f7a8b9c0d1", "provider": "PAYSTACK", "payoutMethodId": "65f1a2b3c4d5e6f7a8b9d000", "amount": 100.0, "currency": "GBP", "status": "PROCESSING", "reference": "wd_7c4e2a1b-...", "providerTransferId": "TRF_abc123", "failureReason": null, "processedAt": null, "createdAt": "2026-10-02T09:20:00.000Z", "updatedAt": "2026-10-02T09:20:00.000Z" }
  ],
  "page": 1, "pageSize": 20, "total": 1
}
```

**Errors:** `401` · `403`.

*(There is deliberately no admin write endpoint here — e.g. to manually
force a stuck withdrawal to `COMPLETED`/`FAILED`. See "Remaining known
gaps" below.)*

---

## 9. Reserved category keywords — `/api/admin/reserved-categories`

Capability: **`MANAGE_JOB_CATEGORIES`** (`SUPER_ADMIN`, `DEVELOPER`). This is
the admin-manageable version of what used to be a hardcoded constant in
`lib/catalogRules.ts` — the keyword list that blocks `BUSINESS_SUPPLIER`
accounts from listing a catalog category containing "cleaning" (that
vertical is exclusive to the seeded `CLEANING_PROVIDER`).

### `GET /api/admin/reserved-categories`
```json
{
  "keywords": [
    { "id": "...", "keyword": "cleaning", "addedBy": null, "createdAt": "..." }
  ],
  "usingHardcodedDefaults": false,
  "effectiveKeywords": ["cleaning"]
}
```
`usingHardcodedDefaults: true` and `keywords: []` together mean the table is
empty and the system is falling back to the built-in defaults
(`["cleaning", "cleaner", "housekeeping"]`) — `effectiveKeywords` always
shows what's actually being checked against right now, whichever source
it's coming from. `addedBy` is `null` for keywords that came from a
database row created before this field existed, or seeded by other means;
otherwise it's the admin's `AccountProfile.id`.

### `POST /api/admin/reserved-categories`
```json
{ "keyword": "Laundry" }
```
Stored lowercased and trimmed. **The first keyword you add switches the
system off the hardcoded defaults entirely** — if you want "cleaning" to
stay blocked *and* add "laundry", add both explicitly; adding only
"laundry" would mean "cleaning" is no longer reserved.

**Response — `201`:** `{ "keyword": { "id": "...", "keyword": "laundry", "addedBy": "...", "createdAt": "..." } }`

**Errors:** `409` — `{ "error": "This keyword is already reserved." }`

### `DELETE /api/admin/reserved-categories/{id}`
**Response — `200`:** `{ "success": true }`
**Errors:** `404` — `{ "error": "Reserved keyword not found." }`

---

## 10. Audit log — `/api/admin/audit-log`

Capability: **`VIEW_AUDIT_LOG`** (`SUPER_ADMIN`, `DEVELOPER` only —
deliberately withheld from `SUPPORT` even though `SUPPORT` has
`VIEW_PLATFORM_DATA`; this is a step more sensitive than user/dispute
visibility).

### `GET /api/admin/audit-log`
Query params (all optional): `action`, `adminId`, `targetType`, `page`,
`pageSize`.

**Response — `200`:**
```json
{
  "items": [
    { "id": "...", "adminId": "65f1a2b3c4d5e6f7a8b9c0d1", "action": "USER_SUSPENDED", "targetType": "AccountProfile", "targetId": "65f1a2b3c4d5e6f7a8b9c0e5", "metadata": { "reason": "Repeated no-shows" }, "createdAt": "..." },
    { "id": "...", "adminId": "65f1a2b3c4d5e6f7a8b9c0d1", "action": "COMMISSION_RATE_UPDATED", "targetType": "CommissionRate", "targetId": "...", "metadata": { "sourceType": "ERRAND", "oldRate": 0.15, "newRate": 0.12 }, "createdAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 2
}
```

**Not every admin write is logged here** — only the ones with real
security/financial consequences:

| `action` | Logged from |
|---|---|
| `ADMIN_ROLE_GRANTED` | `POST /api/admin/admins` |
| `ADMIN_ROLE_REVOKED` | `DELETE /api/admin/admins/{id}` |
| `USER_SUSPENDED` | `POST /api/admin/users/{id}/suspend` |
| `USER_REINSTATED` | `POST /api/admin/users/{id}/reinstate` |
| `COMMISSION_RATE_UPDATED` | `PATCH /api/admin/commission-rates/{sourceType}` |
| `VERIFICATION_REVIEWED` | `POST /api/admin/verifications/{id}/review` |
| `DISPUTE_UPDATED` | `POST /api/disputes/{id}/manage` |
| `RESERVED_CATEGORY_ADDED` / `RESERVED_CATEGORY_REMOVED` | section 9 above |

Content (blog/adverts), job-category create/edit, and every read-only
`VIEW_PLATFORM_DATA` endpoint are **not** logged here — see `lib/auditLog.ts`
and `logAdminAction` if you want to extend coverage.

---

## Cleaning provider region management — clarified, not a gap

There is **no admin endpoint** that sets which regions the seeded
`CLEANING_PROVIDER` account covers, and that's intentional, not missing: the
provider account is a real, loggable-in account like any other (see
`prisma/seed.ts`), so it manages its own `serviceRegions` the exact same way
a `RUNNER` or `BUSINESS_SUPPLIER` does — by logging in as that account and
calling `PATCH /api/account` (see `USER_API.md`, section 2). An admin acting
*as* the provider is just using the provider's own login, not a separate
admin surface. If you want a true admin-side override (editing the
provider's regions without its credentials), that doesn't exist today and
would need a dedicated endpoint.

---

## Remaining known gaps

- **No admin write access over deposits/withdrawals** — `GET /api/admin/deposits`
  and `/withdrawals` are read-only (section 8). If a gateway's webhook never
  arrives (and the user never happens to poll `GET /api/wallet/deposits/{id}`,
  which also re-verifies), a deposit/withdrawal can sit `PENDING`/`PROCESSING`
  indefinitely with no admin action to force-resolve it — manual DB
  intervention would be required today.
- **Paystack's GBP/UK support is unconfirmed** — its documented settlement
  currencies are NGN/GHS/ZAR/KES. If your merchant account isn't approved
  for GBP, every Paystack deposit/withdrawal for this business will fail at
  the gateway. See `lib/payments/paystack.ts` for the full caveat; confirm
  directly with Paystack before relying on it in production.
- **No time-series/trend data** — `GET /api/admin/revenue` gives totals and
  a by-source-type breakdown for a date range, not a pre-bucketed series
  (e.g. "revenue by day") for charting; that'd mean calling it repeatedly
  per bucket client-side today.
- **No user-growth/engagement analytics** (signups over time, active
  runners, etc.) — `GET /api/admin/users` is a filterable list, not a
  reporting endpoint.
- `Dispute.relatedId` is a loose, unenforced reference — looking up the
  actual related record is a manual follow-up by the admin (easier now for
  errands/orders via section 8, but not automatically joined).
- **Audit log coverage is partial, not comprehensive** — section 10 covers
  admin grants/revokes, suspension, commission rate edits, verification
  decisions, dispute resolutions, and reserved-category edits. Content
  (blog/advert) actions and job-category create/edit are not logged there
  yet — extend via `logAdminAction` in `lib/auditLog.ts` if you want full
  coverage.
- `AdvertPost.placement` is free text with no fixed taxonomy.
- **No admin write access over deposits/withdrawals/delivery
  jobs/cleaning bookings** — section 8's new catalog/RFQ/cleaning/delivery
  endpoints are read-only, same as errands/orders already were; there's no
  `MANAGE_` counterpart for any of them (force-completing a stuck delivery,
  editing a catalog listing on a supplier's behalf, etc.).

---

## Becoming an admin in the first place (not an HTTP endpoint)

There is no API call that creates the first admin — it's bootstrapped via
`prisma/seed.ts`:
```
ADMIN_EMAIL="you@yourcompany.co.uk" ADMIN_PASSWORD="..." npx prisma db seed
```
This always grants **`SUPER_ADMIN`** specifically (never a lesser role),
since it's the only role capable of granting the others via
`POST /api/admin/admins` above. See `README.md` for the full seed script
behavior (it also seeds the singleton `CLEANING_PROVIDER` account in the
same run).
