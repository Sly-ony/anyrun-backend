import { NextRequest } from "next/server";
import type { AccountType, AccountKind, AdminRole } from "@prisma/client";
import prisma from "./prisma";
import { ApiError } from "./apiError";
import { getAuthFromRequest } from "./session";

export interface AuthContext {
  userId: string;
  accountProfileId: string;
  roles: AccountType[];
  accountKind: AccountKind;
  adminRole: AdminRole | null;
}

/**
 * Verifies the request carries a valid session and returns the caller's
 * identity. Throws ApiError(401) otherwise. Every protected route (errands,
 * RFQs, catalog, orders, etc.) should start with `const auth = await
 * requireAuth(request);`.
 */
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    throw new ApiError(401, "Authentication required.");
  }

  // Re-check the profile still exists and is active on every request rather
  // than trusting stale JWT claims — cheap given Mongo's document lookups,
  // and it's how we catch e.g. a deactivated CLEANING_PROVIDER account.
  const profile = await prisma.accountProfile.findUnique({
    where: { id: payload.accountProfileId },
  });

  if (!profile || !profile.isActive) {
    throw new ApiError(401, "Session is no longer valid.");
  }

  return {
    userId: payload.sub,
    accountProfileId: profile.id,
    roles: profile.roles,
    accountKind: profile.accountKind,
    adminRole: profile.adminRole,
  };
}

/** Throws ApiError(403) unless the caller holds at least one of `allowed` roles. */
export function requireRole(auth: AuthContext, allowed: AccountType[]): void {
  const hasRole = auth.roles.some((r) => allowed.includes(r));
  if (!hasRole) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }
}

/**
 * Like requireAuth, but returns null instead of throwing when there's no
 * valid session. For endpoints that are publicly browsable (catalog search)
 * but can tailor results when the caller happens to be logged in.
 */
export async function getOptionalAuth(request: NextRequest): Promise<AuthContext | null> {
  try {
    return await requireAuth(request);
  } catch {
    return null;
  }
}
