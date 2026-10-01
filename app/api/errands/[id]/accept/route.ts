import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { RUNNER_ROLE } from "@/lib/roles";
import { findJobCategoryByName, hasApprovedCategoryVerification } from "@/lib/verificationRules";

interface Params {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, [RUNNER_ROLE]);

    const errand = await prisma.errandRequest.findUnique({ where: { id: params.id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.status !== "OPEN") {
      throw new ApiError(409, "This errand is no longer open for acceptance.");
    }
    if (errand.runnerId) {
      throw new ApiError(409, "This errand has already been accepted by another runner.");
    }
    if (errand.customerId === auth.accountProfileId) {
      throw new ApiError(400, "You cannot accept your own errand request.");
    }

    // ErrandRequest.category is free text; only errands whose category
    // matches a curated, verification-requiring JobCategory are gated here.
    const jobCategory = await findJobCategoryByName(errand.category);
    if (jobCategory?.requiresVerification) {
      const verified = await hasApprovedCategoryVerification(auth.accountProfileId, jobCategory.id);
      if (!verified) {
        throw new ApiError(
          403,
          `The "${jobCategory.name}" category requires verification before you can accept jobs in it. Submit via POST /api/account/job-categories.`
        );
      }
    }

    // Guard against two runners racing to accept the same errand: only
    // succeeds if it's still OPEN and unassigned at write time.
    const result = await prisma.errandRequest.updateMany({
      where: { id: params.id, status: "OPEN", runnerId: null },
      data: { status: "ACCEPTED", runnerId: auth.accountProfileId },
    });

    if (result.count === 0) {
      throw new ApiError(409, "This errand was just accepted by someone else.");
    }

    const updated = await prisma.errandRequest.findUnique({ where: { id: params.id } });
    return NextResponse.json({ errand: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
