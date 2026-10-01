import type { AccountType } from "@prisma/client";

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

const BUSINESS_ROLE_SET = new Set<AccountType>(RFQ_BUYER_ROLES.concat(SUPPLIER_ROLE));

/**
 * BUSINESS if any business-side role was chosen, INDIVIDUAL otherwise. Not a
 * separate sign-up question — it's derived from the same `roles` array the
 * client already sends, so "register as a business or individual" falls out
 * of picking BUSINESS_BUYER/BUSINESS_SUPPLIER vs INDIVIDUAL_CUSTOMER/RUNNER.
 */
export function deriveAccountKind(roles: AccountType[]): "INDIVIDUAL" | "BUSINESS" {
  return roles.some((r) => BUSINESS_ROLE_SET.has(r)) ? "BUSINESS" : "INDIVIDUAL";
}
