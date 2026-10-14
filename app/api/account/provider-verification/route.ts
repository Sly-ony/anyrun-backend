import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { providerVerificationSchema } from "@/lib/validation/onboarding";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const isProvider =
      auth.roles.includes("RUNNER") || auth.roles.includes("BUSINESS_SUPPLIER");
    if (!isProvider) {
      throw new ApiError(
        400,
        "Only accounts that provide a service need VAT and insurance details."
      );
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { vatNumber, insuranceDocumentUrl } = providerVerificationSchema.parse(body);

    const latest = await prisma.verification.findFirst({
      where: { accountProfileId: auth.accountProfileId, type: "PROVIDER_COMPLIANCE" },
      orderBy: { submittedAt: "desc" },
    });
    if (latest?.status === "APPROVED") {
      throw new ApiError(409, "Your VAT and insurance details are already approved.");
    }

    const documents = [{ title: "Business insurance", url: insuranceDocumentUrl }];
    const notes = `VAT number: ${vatNumber}`;

    const { profile, verification } = await prisma.$transaction(async (tx) => {
      const profile = await tx.accountProfile.update({
        where: { id: auth.accountProfileId },
        data: { vatNumber, insuranceDocumentUrl, canProvideServices: false },
      });
      // Correct a still-pending submission in place; otherwise (first time
      // or after a rejection) open a new one for the admin queue.
      const verification =
        latest?.status === "PENDING"
          ? await tx.verification.update({
              where: { id: latest.id },
              data: { documents, notes, submittedAt: new Date() },
            })
          : await tx.verification.create({
              data: {
                accountProfileId: auth.accountProfileId,
                type: "PROVIDER_COMPLIANCE",
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