import prisma from "./prisma";

export async function hasApprovedBusinessVerification(accountProfileId: string): Promise<boolean> {
  const verification = await prisma.verification.findFirst({
    where: { accountProfileId, type: "BUSINESS", status: "APPROVED" },
  });
  return !!verification;
}

export async function hasApprovedCategoryVerification(
  accountProfileId: string,
  jobCategoryId: string
): Promise<boolean> {
  const verification = await prisma.verification.findFirst({
    where: { accountProfileId, type: "JOB_CATEGORY", jobCategoryId, status: "APPROVED" },
  });
  return !!verification;
}

/**
 * ErrandRequest.category is free text (unchanged, to avoid disturbing the
 * already-built errand flow), while JobCategory is a managed list — this is
 * the one place that bridges them, by case-insensitive name match. An errand
 * category with no matching JobCategory row is treated as not requiring
 * verification (fail open for categories the founder hasn't curated yet).
 */
export async function findJobCategoryByName(name: string) {
  return prisma.jobCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, isActive: true },
  });
}
