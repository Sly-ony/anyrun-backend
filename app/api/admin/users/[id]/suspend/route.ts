import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { suspendUserSchema } from "@/lib/validation/suspension";
import { notifyAccountSuspended } from "@/lib/notificationService";
import { logAdminAction } from "@/lib/auditLog";

interface Params {
  params: Promise<{ id: string }>; // AccountProfile.id
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_USERS");

    const profile = await prisma.accountProfile.findUnique({ where: { id } });
    if (!profile) throw new ApiError(404, "Account not found.");
    if (!profile.isActive) throw new ApiError(409, "This account is already suspended.");
    if (profile.adminRole) {
      throw new ApiError(400, "Admin accounts cannot be suspended through this endpoint.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { reason } = suspendUserSchema.parse(body);

    const updated = await prisma.accountProfile.update({
      where: { id },
      data: {
        isActive: false,
        suspensionReason: reason,
        suspendedAt: new Date(),
        suspendedBy: auth.accountProfileId,
      },
    });

    try {
      await notifyAccountSuspended(profile.id, reason);
    } catch (e) {
      console.error("Failed to create suspension notification:", e);
    }

    await logAdminAction(auth.accountProfileId, "USER_SUSPENDED", "AccountProfile", id, { reason });

    return NextResponse.json({ profile: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
