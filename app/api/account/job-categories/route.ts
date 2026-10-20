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

    const needingVerification = categories.filter((c) => c.requiresVerification);

    const existingVerifications = await prisma.verification.findMany({
      where: {
        accountProfileId: auth.accountProfileId,
        type: "JOB_CATEGORY",
        jobCategoryId: { in: needingVerification.map((c) => c.id) },
      },
      orderBy: { submittedAt: "desc" },
    });

    // A category already APPROVED or PENDING needs no new submission; only a
    // first selection or a past rejection does.
    const liveFor = (categoryId: string) =>
      existingVerifications.find((v) => v.jobCategoryId === categoryId && v.status === "APPROVED") ??
      existingVerifications.find((v) => v.jobCategoryId === categoryId && v.status === "PENDING");

    const needsSubmission = needingVerification.filter((c) => !liveFor(c.id));
    const missingDocs = needsSubmission.filter((c) => !verificationDocuments?.[c.id]?.length);
    if (missingDocs.length > 0) {
      throw new ApiError(
        400,
        `Verification documents are required for: ${missingDocs.map((c) => c.name).join(", ")}.`
      );
    }

    const results: { category: string; jobCategoryId: string; status: string }[] = [];

    for (const category of needingVerification) {
      const live = liveFor(category.id);
      if (live) {
        results.push({ category: category.name, jobCategoryId: category.id, status: live.status });
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
    const ids = profile?.jobCategoryIds ?? [];

    const categories = ids.length
      ? await prisma.jobCategory.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" } })
      : [];
    const verifications = await prisma.verification.findMany({
      where: { accountProfileId: auth.accountProfileId, type: "JOB_CATEGORY" },
      orderBy: { submittedAt: "desc" }, // newest first
    });

    const items = categories.map((c) => {
      const forCategory = verifications.filter((v) => v.jobCategoryId === c.id);
      const latest = forCategory[0];
      const approved = forCategory.some((v) => v.status === "APPROVED");

      const verificationStatus = !c.requiresVerification
        ? "NOT_REQUIRED"
        : approved
          ? "APPROVED"
          : latest
            ? latest.status
            : "NOT_SUBMITTED";

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        requiresVerification: c.requiresVerification,
        isActive: c.isActive,
        verificationStatus,
        isVerified: !c.requiresVerification || approved,
        verificationId: latest?.id ?? null,
        rejectionReason:
          verificationStatus === "REJECTED" ? (latest?.rejectionReason ?? null) : null,
      };
    });

    return NextResponse.json({ categories: items, verifications });
  } catch (err) {
    return handleApiError(err);
  }
}