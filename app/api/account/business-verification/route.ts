import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { submitBusinessVerificationSchema } from "@/lib/validation/verification";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    if (auth.accountKind !== "BUSINESS") {
      throw new ApiError(
        400,
        "Only accounts registered as a business need business verification."
      );
    }

    const existing = await prisma.verification.findFirst({
      where: { accountProfileId: auth.accountProfileId, type: "BUSINESS" },
      orderBy: { submittedAt: "desc" },
    });
    if (existing && existing.status !== "REJECTED") {
      throw new ApiError(
        409,
        existing.status === "APPROVED"
          ? "This business is already verified."
          : "A business verification is already pending review."
      );
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { documents, notes } = submitBusinessVerificationSchema.parse(body);

    const verification = await prisma.verification.create({
      data: {
        accountProfileId: auth.accountProfileId,
        type: "BUSINESS",
        documents,
        notes,
        status: "PENDING",
      },
    });

    return NextResponse.json({ verification }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
