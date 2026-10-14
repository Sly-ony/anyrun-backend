import { NextRequest, NextResponse } from "next/server";
import type { AccountType, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireSuperAdmin } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import { hashPassword } from "@/lib/password";
import { deriveRoles } from "@/lib/roles";
import { sanitizeUser } from "@/lib/user";
import { logAdminAction } from "@/lib/auditLog";
import { createBusinessSchema } from "@/lib/validation/adminBusiness";
import { assertBusinessNameFree, assertNoOtherCleaningProvider } from "@/lib/adminBusinesses";

// GET /api/admin/businesses?source=USER|ADMIN|ALL&q=&page=&pageSize=
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const source = (searchParams.get("source") ?? "ALL").toUpperCase();
    if (!["USER", "ADMIN", "ALL"].includes(source)) {
      throw new ApiError(400, "source must be USER, ADMIN or ALL.");
    }
    const q = searchParams.get("q")?.trim();

    const where: Prisma.AccountProfileWhereInput = {
      accountKind: "BUSINESS",
      deletedAt: null,
      ...(source !== "ALL" ? { source: source as "USER" | "ADMIN" } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: "insensitive" } },
              { user: { is: { email: { contains: q, mode: "insensitive" } } } },
              { user: { is: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [profiles, total] = await Promise.all([
      prisma.accountProfile.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.accountProfile.count({ where }),
    ]);

    const items = profiles.map(({ user, ...profile }) => ({
      user: sanitizeUser(user),
      profile,
      isCleaningProvider: profile.roles.includes("CLEANING_PROVIDER"),
    }));

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/admin/businesses  — one form, saved to User + AccountProfile (+ documents)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireSuperAdmin(auth);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = createBusinessSchema.parse(body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: d.email }, ...(d.phone ? [{ phone: d.phone }] : [])] },
    });
    if (existing) {
      throw new ApiError(409, "An account with this email or phone already exists.");
    }
    await assertBusinessNameFree(d.businessName);
    if (d.isCleaningProvider) await assertNoOtherCleaningProvider();

    const passwordHash = await hashPassword(d.password);
    const roles: AccountType[] = d.isCleaningProvider
      ? ["CLEANING_PROVIDER"]
      : deriveRoles("BUSINESS", "PROVIDE_SERVICE");

    const { user, profile } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: d.email,
          phone: d.phone,
          passwordHash,
          name: d.name,
          avatarUrl: d.avatarUrl,
        },
      });
      const profile = await tx.accountProfile.create({
        data: {
          userId: user.id,
          roles,
          accountKind: "BUSINESS",
          source: "ADMIN",
          createdByAdminId: auth.accountProfileId,
          address: d.address ?? d.businessAddress,
          businessName: d.businessName,
          businessAddress: d.businessAddress,
          serviceRegions: d.serviceRegions ?? [],
          vatNumber: d.vatNumber ?? null,
          insuranceDocumentUrl: d.insuranceDocumentUrl ?? null,
          canProvideServices: true, // the admin vouches for it
        },
      });
      if (d.documents && d.documents.length > 0) {
        await tx.verification.create({
          data: {
            accountProfileId: profile.id,
            type: "BUSINESS",
            documents: d.documents,
            status: "APPROVED",
            reviewedBy: auth.accountProfileId,
            reviewedAt: new Date(),
          },
        });
      }
      return { user, profile };
    });

    await logAdminAction(auth.accountProfileId, "BUSINESS_CREATED", "AccountProfile", profile.id, {
      businessName: d.businessName,
      isCleaningProvider: d.isCleaningProvider,
    });

    return NextResponse.json(
      {
        user: sanitizeUser(user),
        profile,
        isCleaningProvider: roles.includes("CLEANING_PROVIDER"),
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}