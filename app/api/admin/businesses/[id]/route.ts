import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireSuperAdmin } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { hashPassword } from "@/lib/password";
import { sanitizeUser } from "@/lib/user";
import { logAdminAction } from "@/lib/auditLog";
import { updateBusinessSchema } from "@/lib/validation/adminBusiness";
import { assertBusinessNameFree } from "@/lib/adminBusinesses";

interface Params {
  params: Promise<{ id: string }>;
}

async function loadBusiness(id: string) {
  const profile = await prisma.accountProfile.findFirst({
    where: { id, accountKind: "BUSINESS", deletedAt: null },
    include: { user: true },
  });
  if (!profile) throw new ApiError(404, "Business not found.");
  return profile;
}

// Works for both user-registered and admin-added businesses (read-only for the former).
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const { user, ...profile } = await loadBusiness(id);
    const documents = await prisma.verification.findMany({
      where: { accountProfileId: id },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json({ user: sanitizeUser(user), profile, documents });
  } catch (err) {
    return handleApiError(err);
  }
}

// Only businesses added by an admin can be edited here.
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const current = await loadBusiness(id);
    if (current.source !== "ADMIN") {
      throw new ApiError(403, "Only businesses added by an admin can be edited here.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = updateBusinessSchema.parse(body);

    if (d.email && d.email !== current.user.email) {
      const clash = await prisma.user.findUnique({ where: { email: d.email } });
      if (clash) throw new ApiError(409, "That email is already in use by another account.");
    }
    if (d.phone && d.phone !== current.user.phone) {
      const clash = await prisma.user.findUnique({ where: { phone: d.phone } });
      if (clash) throw new ApiError(409, "That phone number is already in use by another account.");
    }
    if (d.businessName) await assertBusinessNameFree(d.businessName, id);

    const passwordHash = d.password ? await hashPassword(d.password) : undefined;

    const [user, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: current.userId },
        data: {
          ...(d.name !== undefined ? { name: d.name } : {}),
          ...(d.email !== undefined ? { email: d.email } : {}),
          ...(d.phone !== undefined ? { phone: d.phone } : {}),
          ...(d.avatarUrl !== undefined ? { avatarUrl: d.avatarUrl } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
      }),
      prisma.accountProfile.update({
        where: { id },
        data: {
          ...(d.address !== undefined ? { address: d.address } : {}),
          ...(d.businessName !== undefined ? { businessName: d.businessName } : {}),
          ...(d.businessAddress !== undefined ? { businessAddress: d.businessAddress } : {}),
          ...(d.serviceRegions !== undefined ? { serviceRegions: d.serviceRegions } : {}),
          ...(d.vatNumber !== undefined ? { vatNumber: d.vatNumber } : {}),
          ...(d.insuranceDocumentUrl !== undefined
            ? { insuranceDocumentUrl: d.insuranceDocumentUrl }
            : {}),
        },
      }),
    ]);

    await logAdminAction(auth.accountProfileId, "BUSINESS_UPDATED", "AccountProfile", id, {
      fields: Object.keys(d).filter((k) => k !== "password"),
      passwordReset: !!d.password,
    });

    return NextResponse.json({ user: sanitizeUser(user), profile });
  } catch (err) {
    return handleApiError(err);
  }
}

// Soft delete: the account is deactivated (can't log in) and hidden; data is kept.
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const current = await loadBusiness(id);
    if (current.source !== "ADMIN") {
      throw new ApiError(403, "Only businesses added by an admin can be deleted here.");
    }

    // Don't strand a customer's job (and held money) with an account that can't log in.
    const openJobs = await prisma.errandRequest.count({
      where: { runnerId: id, status: { in: ["ACCEPTED", "IN_PROGRESS", "DELIVERED"] } },
    });
    if (openJobs > 0) {
      throw new ApiError(
        409,
        `This business has ${openJobs} unfinished job(s). Complete or cancel them first.`
      );
    }

    await prisma.accountProfile.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await logAdminAction(auth.accountProfileId, "BUSINESS_DELETED", "AccountProfile", id, {
      businessName: current.businessName,
    });

    return NextResponse.json({ message: "Business deleted." });
  } catch (err) {
    return handleApiError(err);
  }
}