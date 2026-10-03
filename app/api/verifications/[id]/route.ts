import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { hasCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const verification = await prisma.verification.findUnique({ where: { id } });
    if (!verification) throw new ApiError(404, "Verification not found.");

    const canReview = hasCapability(auth.adminRole, "MANAGE_VERIFICATIONS");
    if (verification.accountProfileId !== auth.accountProfileId && !canReview) {
      throw new ApiError(403, "You do not have permission to view this verification.");
    }

    return NextResponse.json({ verification });
  } catch (err) {
    return handleApiError(err);
  }
}
