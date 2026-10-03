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

    const dispute = await prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new ApiError(404, "Dispute not found.");

    const isParty =
      dispute.raisedById === auth.accountProfileId || dispute.againstId === auth.accountProfileId;
    const canManage = hasCapability(auth.adminRole, "MANAGE_DISPUTES");

    if (!isParty && !canManage) {
      throw new ApiError(403, "You do not have permission to view this dispute.");
    }

    return NextResponse.json({ dispute });
  } catch (err) {
    return handleApiError(err);
  }
}
