import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { businessDetailsSchema } from "@/lib/validation/onboarding";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    if (auth.accountKind !== "BUSINESS") {
      throw new ApiError(400, "Only business accounts have business details.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { businessName, businessAddress, documents, notes } =
      businessDetailsSchema.parse(body);

    const existing = await prisma.verification.findFirst({
      where: { accountProfileId: auth.accountProfileId, type: "BUSINESS" },
      orderBy: { submittedAt: "desc" },
    });
    if (existing && existing.status !== "REJECTED") {
      throw new ApiError(
        409,
        existing.status === "APPROVED"
          ? "This business is already verified."
          : "Business details are already pending review."
      );
    }

    const { profile, verification } = await prisma.$transaction(async (tx) => {
      const profile = await tx.accountProfile.update({
        where: { id: auth.accountProfileId },
        data: { businessName, businessAddress },
      });
      const verification = await tx.verification.create({
        data: {
          accountProfileId: auth.accountProfileId,
          type: "BUSINESS",
          documents,
          notes,
          status: "PENDING",
        },
      });
      return { profile, verification };
    });

    return NextResponse.json({ profile, verification }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}