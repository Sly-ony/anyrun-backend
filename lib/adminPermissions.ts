import type { AdminRole } from "@prisma/client";
import { ApiError } from "./apiError";
import type { AuthContext } from "./guard";

export type AdminCapability =
  | "MANAGE_ADMINS" // create/revoke EDITOR, SUPPORT, DEVELOPER — SUPER_ADMIN only
  | "VIEW_COMMISSION_RATES"
  | "MANAGE_COMMISSION_RATES" // edit — SUPER_ADMIN only, deliberately excluded from DEVELOPER
  | "MANAGE_CONTENT" // blog posts + advert posts
  | "MANAGE_USERS" // view any user, suspend/reinstate
  | "MANAGE_DISPUTES" // view + resolve disputes
  | "MANAGE_JOB_CATEGORIES"
  | "MANAGE_VERIFICATIONS" // review business/job-category submissions
  | "VIEW_PLATFORM_DATA" // platform-wide errands/orders/revenue/rfqs/catalog/cleaning/delivery (read-only — no corresponding MANAGE_ variant yet)
  | "VIEW_AUDIT_LOG" // sensitive enough to withhold from SUPPORT even though SUPPORT has VIEW_PLATFORM_DATA
  | "MANAGE_WITHDRAWALS"; // mark a manual payout paid / reject it — SUPPORT does this by hand

// SUPER_ADMIN is deliberately not listed here — it's handled as a bypass in
// hasCapability below, since by definition it can do everything any other
// role can plus admin management and commission-rate edits.
const ROLE_CAPABILITIES: Record<Exclude<AdminRole, "SUPER_ADMIN">, AdminCapability[]> = {
  // "Developer can see everything and edit everything except commission
  // rates" — every capability except the two SUPER_ADMIN-only ones.
  DEVELOPER: [
    "VIEW_COMMISSION_RATES",
    "MANAGE_CONTENT",
    "MANAGE_USERS",
    "MANAGE_DISPUTES",
    "MANAGE_JOB_CATEGORIES",
    "MANAGE_VERIFICATIONS",
    "VIEW_PLATFORM_DATA",
    "VIEW_AUDIT_LOG",
    "MANAGE_WITHDRAWALS",
  ],
  EDITOR: ["MANAGE_CONTENT"],
  // SUPPORT gets VIEW_PLATFORM_DATA alongside MANAGE_DISPUTES: resolving a
  // dispute over an errand/order requires being able to look the thing up,
  // not just the dispute record pointing at its id.
  SUPPORT: ["MANAGE_USERS", "MANAGE_DISPUTES", "VIEW_PLATFORM_DATA", "MANAGE_WITHDRAWALS"],
};

export function hasCapability(role: AdminRole | null, capability: AdminCapability): boolean {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Throws ApiError(403) unless the caller's admin role grants `capability`. */
export function requireAdminCapability(auth: AuthContext, capability: AdminCapability): void {
  if (!hasCapability(auth.adminRole, capability)) {
    throw new ApiError(403, `This action requires the ${capability} admin capability.`);
  }
}

/** Throws ApiError(403) unless the caller is specifically a SUPER_ADMIN. */
export function requireSuperAdmin(auth: AuthContext): void {
  if (auth.adminRole !== "SUPER_ADMIN") {
    throw new ApiError(403, "This action requires the super admin role.");
  }
}
