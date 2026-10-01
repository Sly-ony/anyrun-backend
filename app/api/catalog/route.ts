import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole, getOptionalAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createCatalogItemSchema } from "@/lib/validation/catalog";
import { isReservedCategory } from "@/lib/catalogRules";
import { SUPPLIER_ROLE } from "@/lib/roles";
import { parsePagination } from "@/lib/pagination";
import { hasApprovedBusinessVerification } from "@/lib/verificationRules";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, [SUPPLIER_ROLE]);

    if (!(await hasApprovedBusinessVerification(auth.accountProfileId))) {
      throw new ApiError(
        403,
        "Business verification is required before listing catalog items. Submit documents via POST /api/account/business-verification."
      );
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createCatalogItemSchema.parse(body);

    if (isReservedCategory(data.category)) {
      throw new ApiError(
        400,
        "Cleaning services are exclusively provided through the platform's cleaning booking flow and cannot be listed as a catalog category."
      );
    }

    const item = await prisma.catalogItem.create({
      data: {
        supplierId: auth.accountProfileId,
        title: data.title,
        description: data.description,
        category: data.category,
        price: data.price,
        currency: data.currency ?? "GBP",
        photos: data.photos ?? [],
        region: data.region,
        isAvailable: data.isAvailable ?? true,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

// Public browse/search — no login required, matching "general public can
// search by category + region" in the brief. A logged-in supplier can pass
// ?mine=true to see their own listings, including hidden ones.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const mine = searchParams.get("mine") === "true";
    const category = searchParams.get("category") ?? undefined;
    const state = searchParams.get("state") ?? undefined;
    const city = searchParams.get("city") ?? undefined;
    const q = searchParams.get("q") ?? undefined;
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const supplierId = searchParams.get("supplierId") ?? undefined;

    const clauses: Prisma.CatalogItemWhereInput[] = [];

    if (mine) {
      const auth = await requireAuth(request);
      requireRole(auth, [SUPPLIER_ROLE]);
      clauses.push({ supplierId: auth.accountProfileId });
    } else {
      // Optional auth: doesn't change access here, but keeps the door open
      // for future personalization (e.g. defaulting region to the caller's).
      await getOptionalAuth(request);
      clauses.push({ isAvailable: true });
      if (supplierId) clauses.push({ supplierId });
    }

    if (category) clauses.push({ category });
    if (state && city) clauses.push({ region: { is: { state, city } } });
    else if (state) clauses.push({ region: { is: { state } } });

    if (minPrice || maxPrice) {
      clauses.push({
        price: {
          ...(minPrice ? { gte: parseFloat(minPrice) } : {}),
          ...(maxPrice ? { lte: parseFloat(maxPrice) } : {}),
        },
      });
    }

    if (q) {
      clauses.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.CatalogItemWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.catalogItem.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.catalogItem.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
