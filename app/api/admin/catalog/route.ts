import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

// The public GET /api/catalog only ever returns isAvailable: true items
// (or a supplier's own, via mine=true) — this is the only way to see every
// listing platform-wide, including ones suppliers have hidden.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const supplierId = searchParams.get("supplierId") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const isAvailable = searchParams.get("isAvailable");
    const state = searchParams.get("state") ?? undefined;
    const city = searchParams.get("city") ?? undefined;

    const clauses: Prisma.CatalogItemWhereInput[] = [];
    if (supplierId) clauses.push({ supplierId });
    if (category) clauses.push({ category });
    if (isAvailable !== null) clauses.push({ isAvailable: isAvailable === "true" });
    if (state) clauses.push({ region: { path: ["state"], equals: state } });
    if (city) clauses.push({ region: { path: ["city"], equals: city } });

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
