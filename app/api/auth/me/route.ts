import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError, ApiError } from "@/lib/apiError";
import { sanitizeUser } from "@/lib/user";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { accountProfile: true },
    });

    if (!user || !user.accountProfile) {
      throw new ApiError(401, "Session is no longer valid.");
    }

    return NextResponse.json({
      user: sanitizeUser(user),
      profile: user.accountProfile,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
