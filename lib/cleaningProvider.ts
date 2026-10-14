import prisma from "./prisma";
import { ApiError } from "./apiError";

/**
 * Finds the platform's one active cleaning-provider account. It is an
 * admin-added business that a super admin marked as the cleaning provider
 * (see /api/admin/businesses). If none exists, cleaning bookings return 503
 * until an admin adds one.
 */
export async function getActiveCleaningProvider() {
  const providers = await prisma.accountProfile.findMany({
    where: { roles: { has: "CLEANING_PROVIDER" }, isActive: true, deletedAt: null },
  });

  if (providers.length === 0) {
    throw new ApiError(
      503,
      "No cleaning provider is available yet. An admin must add a business and mark it as the cleaning provider."
    );
  }
  if (providers.length > 1) {
    console.error(
      `Data integrity warning: ${providers.length} active CLEANING_PROVIDER accounts found; expected exactly 1.`
    );
  }

  return providers[0];
}