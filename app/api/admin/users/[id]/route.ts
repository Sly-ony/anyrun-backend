import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

interface Params {
  params: Promise<{ id: string }>; // AccountProfile.id
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_USERS");

    const profile = await prisma.accountProfile.findUnique({ where: { id } });
    if (!profile) throw new ApiError(404, "Account not found.");

    const user = await prisma.user.findUnique({ where: { id: profile.userId } });
    if (!user) throw new ApiError(404, "Account not found.");

    return NextResponse.json({ user: sanitizeUser(user), profile });
  } catch (err) {
    return handleApiError(err);
  }
}
