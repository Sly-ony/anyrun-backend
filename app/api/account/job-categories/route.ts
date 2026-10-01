import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { selectJobCategoriesSchema } from "@/lib/validation/verification";
import { RUNNER_ROLE } from "@/lib/roles";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, [RUNNER_ROLE]);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { jobCategoryIds, verificationDocuments } = selectJobCategoriesSchema.parse(body);

    const categories = await prisma.jobCategory.findMany({
      where: { id: { in: jobCategoryIds }, isActive: true },
    });
    if (categories.length !== jobCategoryIds.length) {
      throw new ApiError(400, "One or more job category ids are invalid or inactive.");
    }

    // Every category that requires verification must have documents supplied
    // right here — selecting several verification-required categories means
    // verifying all of them, not one at a time.
    const needingVerification = categories.filter((c) => c.requiresVerification);
    const missingDocs = needingVerification.filter(
      (c) => !verificationDocuments?.[c.id]?.length
    );
    if (missingDocs.length > 0) {
      throw new ApiError(
        400,
        `Verification documents are required for: ${missingDocs.map((c) => c.name).join(", ")}.`
      );
    }

    const existingVerifications = await prisma.verification.findMany({
      where: {
        accountProfileId: auth.accountProfileId,
        type: "JOB_CATEGORY",
        jobCategoryId: { in: needingVerification.map((c) => c.id) },
      },
    });

    const results: { category: string; jobCategoryId: string; status: string }[] = [];

    for (const category of needingVerification) {
      const existing = existingVerifications.find((v) => v.jobCategoryId === category.id);

      // Already approved — nothing to resubmit. Already pending — leave it
      // for the admin to review rather than spawning a duplicate. Only a
      // fresh selection or a past rejection creates a new submission.
      if (existing && existing.status !== "REJECTED") {
        results.push({ category: category.name, jobCategoryId: category.id, status: existing.status });
        continue;
      }

      const verification = await prisma.verification.create({
        data: {
          accountProfileId: auth.accountProfileId,
          type: "JOB_CATEGORY",
          jobCategoryId: category.id,
          documents: verificationDocuments![category.id],
          status: "PENDING",
        },
      });
      results.push({ category: category.name, jobCategoryId: category.id, status: verification.status });
    }

    const profile = await prisma.accountProfile.update({
      where: { id: auth.accountProfileId },
      data: { jobCategoryIds },
    });

    return NextResponse.json({ profile, verifications: results }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, [RUNNER_ROLE]);

    const profile = await prisma.accountProfile.findUnique({
      where: { id: auth.accountProfileId },
    });
    const categories = profile?.jobCategoryIds.length
      ? await prisma.jobCategory.findMany({ where: { id: { in: profile.jobCategoryIds } } })
      : [];
    const verifications = await prisma.verification.findMany({
      where: { accountProfileId: auth.accountProfileId, type: "JOB_CATEGORY" },
    });

    return NextResponse.json({ categories, verifications });
  } catch (err) {
    return handleApiError(err);
  }
}
