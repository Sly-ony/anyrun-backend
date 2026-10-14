import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireSuperAdmin } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { grantAdminRoleSchema } from "@/lib/validation/admin";
import { logAdminAction } from "@/lib/auditLog";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const admins = await prisma.accountProfile.findMany({
      where: { adminRole: { not: null } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ admins });
  } catch (err) {
    return handleApiError(err);
  }
}

// Only SUPER_ADMIN can grant admin roles, and only ever EDITOR/SUPPORT/
// DEVELOPER — there is no way to create or promote someone to SUPER_ADMIN
// through the API (see prisma/seed.ts and docs/ADMIN_API.md).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { email, role } = grantAdminRoleSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { accountProfile: true },
    });
    if (!user || !user.accountProfile) {
      throw new ApiError(404, "No account with that email exists yet — they must sign up first.");
    }
    if (user.accountProfile.adminRole === "SUPER_ADMIN") {
      throw new ApiError(400, "Cannot change the role of a super admin through this endpoint.");
    }

    const updated = await prisma.accountProfile.update({
      where: { id: user.accountProfile.id },
      data: { adminRole: role },
    });

    await logAdminAction(auth.accountProfileId, "ADMIN_ROLE_GRANTED", "AccountProfile", updated.id, { role });

    return NextResponse.json({ profile: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
