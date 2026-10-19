import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError, ApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { accountProfile: true },
    });

    if (!user || !user.accountProfile) {
      throw new ApiError(401, "Session is no longer valid.");
    }
    const profile = user.accountProfile;

    const isBusiness = profile.accountKind === "BUSINESS";
    const isProvider =
      profile.roles.includes("RUNNER") || profile.roles.includes("BUSINESS_SUPPLIER");

    const jobCategoryIds: string[] = profile.jobCategoryIds ?? [];

    const [businessV, providerV, categoryRows] = await Promise.all([
      isBusiness
        ? prisma.verification.findFirst({
            where: { accountProfileId: profile.id, type: "BUSINESS" },
            orderBy: { submittedAt: "desc" },
          })
        : null,
      isProvider
        ? prisma.verification.findFirst({
            where: { accountProfileId: profile.id, type: "PROVIDER_COMPLIANCE" },
            orderBy: { submittedAt: "desc" },
          })
        : null,
      // One query for every id the account has selected. Skipped when there are none.
      jobCategoryIds.length > 0
        ? prisma.jobCategory.findMany({ where: { id: { in: jobCategoryIds } } })
        : [],
    ]);

    // findMany doesn't preserve the order of `in`, so put the rows back in the order the
    // ids are stored. An id whose category was deleted is simply left out.
    const byId = new Map(categoryRows.map((c) => [c.id, c]));
    const jobCategories = jobCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);

    const missing: string[] = [];
    if (!user.avatarUrl) missing.push("profilePicture");
    if (isBusiness && (!profile.businessName || !businessV || businessV.status === "REJECTED")) {
      missing.push("businessDetails");
    }
    if (isProvider && (!providerV || providerV.status === "REJECTED")) {
      missing.push("providerVerification");
    }

    return NextResponse.json({
      user: sanitizeUser(user),
      profile,
      jobCategories, // full details (id, name, ...) for profile.jobCategoryIds
      onboarding: {
        missing, // steps the user still has to submit
        nextStep: missing[0] ?? null,
        businessStatus: businessV?.status ?? null, // PENDING | APPROVED | REJECTED | null
        providerStatus: providerV?.status ?? null,
        providerRejectionReason:
          providerV?.status === "REJECTED" ? providerV.rejectionReason : null,
        canProvideServices: profile.canProvideServices,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}