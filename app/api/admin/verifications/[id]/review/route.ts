import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { reviewVerificationSchema } from "@/lib/validation/verification";
import { notifyVerificationReviewed } from "@/lib/notificationService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_VERIFICATIONS");

    const verification = await prisma.verification.findUnique({ where: { id } });
    if (!verification) throw new ApiError(404, "Verification not found.");
    if (verification.status !== "PENDING") {
      throw new ApiError(409, "Only a PENDING verification can be reviewed.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { decision, rejectionReason } = reviewVerificationSchema.parse(body);

    const updated = await prisma.verification.update({
      where: { id },
      data: {
        status: decision,
        rejectionReason: decision === "REJECTED" ? rejectionReason : null,
        reviewedBy: auth.accountProfileId,
        reviewedAt: new Date(),
      },
    });

    const label =
      verification.type === "BUSINESS"
        ? "business"
        : (await prisma.jobCategory.findUnique({ where: { id: verification.jobCategoryId! } }))
            ?.name ?? "job category";

    try {
      await notifyVerificationReviewed(
        verification.accountProfileId,
        decision === "APPROVED",
        label
      );
    } catch (e) {
      console.error("Failed to notify submitter of verification decision:", e);
    }

    return NextResponse.json({ verification: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
