import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_USERS");

    const profile = await prisma.accountProfile.findUnique({ where: { id: params.id } });
    if (!profile) throw new ApiError(404, "Account not found.");
    if (profile.isActive) throw new ApiError(409, "This account is not currently suspended.");

    const updated = await prisma.accountProfile.update({
      where: { id: params.id },
      data: {
        isActive: true,
        suspensionReason: null,
        suspendedAt: null,
        suspendedBy: null,
      },
    });

    return NextResponse.json({ profile: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
