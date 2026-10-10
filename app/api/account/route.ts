import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateAccountSchema } from "@/lib/validation/account";
import { sanitizeUser } from "@/lib/user";

// GET /api/account intentionally doesn't exist here — it would just
// duplicate GET /api/auth/me, which already returns the caller's User +
// AccountProfile. This route only handles the edit half.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateAccountSchema.parse(body);

    if (data.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
      if (existing && existing.id !== auth.userId) {
        throw new ApiError(409, "That phone number is already in use by another account.");
      }
    }

    const [user, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: auth.userId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
        },
      }),
      prisma.accountProfile.update({
        where: { id: auth.accountProfileId },
        data: {
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.businessName !== undefined ? { businessName: data.businessName } : {}),
          ...(data.businessAddress !== undefined ? { businessAddress: data.businessAddress } : {}),
          ...(data.serviceRegions !== undefined ? { serviceRegions: data.serviceRegions } : {}),
        },
      }),
    ]);

    return NextResponse.json({ user: sanitizeUser(user), profile });
  } catch (err) {
    return handleApiError(err);
  }
}
