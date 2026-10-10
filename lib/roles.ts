import type { AccountType, AccountKind } from "@prisma/client";

// Who is allowed to post an "errand" (flow A): individuals and buyer-side
// businesses (e.g. an estate company asking a runner to go pick something up).
export const ERRAND_CUSTOMER_ROLES: AccountType[] = [
  "INDIVIDUAL_CUSTOMER",
  "BUSINESS_BUYER",
];

export const RUNNER_ROLE: AccountType = "RUNNER";

// Who is allowed to post an RFQ (flow B).
export const RFQ_BUYER_ROLES: AccountType[] = ["BUSINESS_BUYER"];

export const SUPPLIER_ROLE: AccountType = "BUSINESS_SUPPLIER";

export type ServiceIntent = "PROVIDE_SERVICE" | "NEED_SERVICE";

/**
 * Roles are now DERIVED from the two questions sign-up actually asks —
 * accountKind (INDIVIDUAL/BUSINESS) and intent (provide a service / need a
 * service) — rather than the client picking from the AccountType enum
 * directly. "Provide a service" always means RUNNER (the admin-curated
 * job-category flow — see lib/validation/jobCategory.ts), regardless of
 * accountKind: a business providing a service (e.g. a two-person cleaning
 * company) goes through the same job-category selection an individual
 * runner does. BUSINESS_SUPPLIER (catalog listings) is deliberately NOT
 * produced here — it's a separate thing a business can still opt into
 * later, not conflated with this intent question. There is currently no
 * endpoint to add roles after sign-up, so for now this is a one-time
 * choice; see docs/USER_API.md for that known gap.
 */
export function deriveRoles(accountKind: AccountKind, intent: ServiceIntent): AccountType[] {
  if (intent === "PROVIDE_SERVICE") return ["RUNNER"];
  return accountKind === "BUSINESS" ? ["BUSINESS_BUYER"] : ["INDIVIDUAL_CUSTOMER"];
}
