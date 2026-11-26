import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateProfileSchema } from "@/lib/validation/profile";
import { sanitizeUser } from "@/lib/user";

// GET /api/account intentionally doesn't exist here — it would just
// duplicate GET /api/auth/me, which already returns the caller's User +
// AccountProfile. This route only handles the edit half.

// Fields that exist on the account but can never be changed through this
// endpoint. Named here so the user gets a clear message instead of a generic one.
const BLOCKED_FIELDS: Record<string, string> = {
  email: "Email can't be changed here.",
  password: "Use the change-password option to change your password.",
  passwordHash: "That field can't be changed.",
  roles: "Account type can't be changed.",
  accountKind: "Account type can't be changed.",
  adminRole: "That field can't be changed.",
  vatNumber: "VAT number and insurance are changed through verification, not here.",
  insuranceDocumentUrl: "VAT number and insurance are changed through verification, not here.",
  canProvideServices: "That field can't be changed.",
  jobCategoryIds: "Change your jobs on the job categories page.",
  isActive: "That field can't be changed.",
  source: "That field can't be changed.",
};

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });

    if (body && typeof body === "object") {
      for (const key of Object.keys(body)) {
        if (BLOCKED_FIELDS[key]) throw new ApiError(400, BLOCKED_FIELDS[key]);
      }
    }

    const data = updateProfileSchema.parse(body);

    // Business name and address belong to a business account, and once an admin
    // has verified them (or an admin created the business) they are locked, so a
    // verified name can't be swapped for another one afterwards.
    if (data.businessName !== undefined || data.businessAddress !== undefined) {
      if (auth.accountKind !== "BUSINESS") {
        throw new ApiError(400, "Only business accounts have a business name or address.");
      }
      const [profile, approved] = await Promise.all([
        prisma.accountProfile.findUnique({
          where: { id: auth.accountProfileId },
          select: { source: true },
        }),
        prisma.verification.findFirst({
          where: { accountProfileId: auth.accountProfileId, type: "BUSINESS", status: "APPROVED" },
          select: { id: true },
        }),
      ]);
      if (profile?.source === "ADMIN" || approved) {
        throw new ApiError(
          409,
          "Your business details are verified, so they can't be edited here. Contact support to change them."
        );
      }
    }

    if (data.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
      if (existing && existing.id !== auth.userId) {
        throw new ApiError(409, "That phone number is already in use by another account.");
      }
    }

    let user, profile;
    try {
      [user, profile] = await prisma.$transaction([
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
            ...(data.bio !== undefined ? { bio: data.bio } : {}),
            ...(data.address !== undefined ? { address: data.address } : {}),
            ...(data.businessName !== undefined ? { businessName: data.businessName } : {}),
            ...(data.businessAddress !== undefined ? { businessAddress: data.businessAddress } : {}),
            ...(data.serviceRegions !== undefined ? { serviceRegions: data.serviceRegions } : {}),
          },
        }),
      ]);
    } catch (e) {
      // Two people saving the same phone number at the same moment.
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
        throw new ApiError(409, "That phone number is already in use by another account.");
      }
      throw e;
    }

    return NextResponse.json({ user: sanitizeUser(user), profile });
  } catch (err) {
    return handleApiError(err);
  }
}