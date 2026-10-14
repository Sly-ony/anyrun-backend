import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import { asLocationArray, asAddress } from "@/lib/json";

// GET /api/accounts?source=USER|ADMIN|ALL&q=&page=&pageSize=
// Public list of active businesses. No email, phone or street address.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const source = (searchParams.get("source") ?? "ALL").toUpperCase();
    if (!["USER", "ADMIN", "ALL"].includes(source)) {
      throw new ApiError(400, "source must be USER, ADMIN or ALL.");
    }
    const q = searchParams.get("q")?.trim();

    const where: Prisma.AccountProfileWhereInput = {
      accountKind: "BUSINESS",
      isActive: true,
      deletedAt: null,
      ...(source !== "ALL" ? { source: source as "USER" | "ADMIN" } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: "insensitive" } },
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

    const items = profiles.map((p) => {
      const a = p.businessAddress ? asAddress(p.businessAddress) : null;
      return {
        id: p.id,
        name: p.user.name,
        avatarUrl: p.user.avatarUrl,
        businessName: p.businessName,
        businessLocation: a ? { country: a.country, state: a.state, city: a.city } : null,
        serviceRegions: asLocationArray(p.serviceRegions).map((r) => ({
          country: r.country,
          state: r.state,
          city: r.city,
        })),
        source: p.source,
        isCleaningProvider: p.roles.includes("CLEANING_PROVIDER"),
        createdAt: p.createdAt,
      };
    });

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}