import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { findJobCategoryByName, hasApprovedCategoryVerification } from "@/lib/verificationRules";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.status !== "OPEN") {
      throw new ApiError(409, "This job is no longer open for acceptance.");
    }
    if (errand.runnerId) {
      throw new ApiError(409, "This job has already been accepted by someone else.");
    }
    if (errand.customerId === auth.accountProfileId) {
      throw new ApiError(400, "You cannot accept your own job.");
    }

    // ErrandRequest.category is free text; only jobs whose category
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

    // Guard against two people racing to accept the same job: only
    // succeeds if it's still OPEN and unassigned at write time.
    const result = await prisma.errandRequest.updateMany({
      where: { id, status: "OPEN", runnerId: null },
      data: { status: "ACCEPTED", runnerId: auth.accountProfileId },
    });

    if (result.count === 0) {
      throw new ApiError(409, "This job was just accepted by someone else.");
    }

    await prisma.errandEvent.create({
      data: {
        errandId: id,
        actorId: auth.accountProfileId,
        fromStatus: "OPEN",
        toStatus: "ACCEPTED",
      },
    });

    const updated = await prisma.errandRequest.findUnique({ where: { id } });
    return NextResponse.json({ errand: updated });
  } catch (err) {
    return handleApiError(err);
  }
}