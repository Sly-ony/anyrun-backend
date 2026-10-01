import prisma from "./prisma";
import { ApiError } from "./apiError";

/**
 * Finds the platform's one active cleaning-provider account. There is no
 * runtime "admin assigns a cleaning provider" endpoint: this account is
 * created once, directly in the database, by prisma/seed.ts, because it's
 * the founder's own company and never changes through normal product use.
 * If this throws, the seed hasn't been run against this database yet.
 */
export async function getActiveCleaningProvider() {
  const providers = await prisma.accountProfile.findMany({
    where: { roles: { has: "CLEANING_PROVIDER" }, isActive: true },
  });

  if (providers.length === 0) {
    throw new ApiError(
      503,
      "No active cleaning provider is configured. Run the database seed script."
    );
  }
  if (providers.length > 1) {
    // Data integrity issue, not a user-facing error — the seed script and
    // signup validation should both prevent this, but if it ever happens we
    // still want bookings to work rather than hard-fail.
    console.error(
      `Data integrity warning: ${providers.length} active CLEANING_PROVIDER accounts found; expected exactly 1.`
    );
  }

  return providers[0];
}
