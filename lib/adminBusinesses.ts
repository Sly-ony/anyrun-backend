import prisma from "./prisma";
import { ApiError } from "./apiError";

/** Only one active business may hold the CLEANING_PROVIDER role. */
export async function assertNoOtherCleaningProvider(excludeProfileId?: string) {
  const other = await prisma.accountProfile.findFirst({
    where: {
      roles: { has: "CLEANING_PROVIDER" },
      isActive: true,
      deletedAt: null,
      ...(excludeProfileId ? { id: { not: excludeProfileId } } : {}),
    },
    select: { businessName: true },
  });
  if (other) {
    throw new ApiError(
      409,
      `"${other.businessName ?? "Another business"}" is already the cleaning provider. Unmark it first.`
    );
  }
}

/** Business names must be unique among active admin-added businesses. */
export async function assertBusinessNameFree(businessName: string, excludeProfileId?: string) {
  const clash = await prisma.accountProfile.findFirst({
    where: {
      source: "ADMIN",
      deletedAt: null,
      businessName: { equals: businessName, mode: "insensitive" },
      ...(excludeProfileId ? { id: { not: excludeProfileId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, "An admin-added business with this name already exists.");
}