import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

// Note: single-RFQ detail is already visible to any authenticated account
// via GET /api/rfqs/{id} (see USER_API.md) — no separate admin detail route
// needed. What's missing without this is listing ALL RFQs regardless of
// status or who posted them; GET /api/rfqs only ever shows "mine" or the
// open, region-scoped browse feed.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const status = searchParams.get("status") ?? undefined;
    const buyerId = searchParams.get("buyerId") ?? undefined;
    const state = searchParams.get("state") ?? undefined;
    const city = searchParams.get("city") ?? undefined;

    const clauses: Prisma.RFQWhereInput[] = [];
    if (status) clauses.push({ status: status as Prisma.EnumRFQStatusFilter["equals"] });
    if (buyerId) clauses.push({ buyerId });
    if (state) clauses.push({ region: { path: ["state"], equals: state } });
    if (city) clauses.push({ region: { path: ["city"], equals: city } });

    const where: Prisma.RFQWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.rFQ.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.rFQ.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
