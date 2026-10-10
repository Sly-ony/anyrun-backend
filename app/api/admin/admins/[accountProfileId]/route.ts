import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireSuperAdmin } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { logAdminAction } from "@/lib/auditLog";

interface Params {
  params: Promise<{ accountProfileId: string }>;
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { accountProfileId } = await params;
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const profile = await prisma.accountProfile.findUnique({ where: { id: accountProfileId } });
    if (!profile) throw new ApiError(404, "Account not found.");
    if (!profile.adminRole) throw new ApiError(400, "This account has no admin role to revoke.");
    if (profile.adminRole === "SUPER_ADMIN") {
      throw new ApiError(400, "Cannot revoke a super admin through this endpoint.");
    }

    const previousRole = profile.adminRole;
    const updated = await prisma.accountProfile.update({
      where: { id: accountProfileId },
      data: { adminRole: null },
    });

    await logAdminAction(auth.accountProfileId, "ADMIN_ROLE_REVOKED", "AccountProfile", accountProfileId, {
      previousRole,
    });

    return NextResponse.json({ profile: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
