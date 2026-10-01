import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireSuperAdmin } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: { accountProfileId: string };
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const profile = await prisma.accountProfile.findUnique({ where: { id: params.accountProfileId } });
    if (!profile) throw new ApiError(404, "Account not found.");
    if (!profile.adminRole) throw new ApiError(400, "This account has no admin role to revoke.");
    if (profile.adminRole === "SUPER_ADMIN") {
      throw new ApiError(400, "Cannot revoke a super admin through this endpoint.");
    }

    const updated = await prisma.accountProfile.update({
      where: { id: params.accountProfileId },
      data: { adminRole: null },
    });

    return NextResponse.json({ profile: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
