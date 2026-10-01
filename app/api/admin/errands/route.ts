import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

// Note: a single errand's detail is already visible to any authenticated
// account via GET /api/errands/{id} (see USER_API.md) — admins don't need a
// separate detail route for that. What's missing without this endpoint is
// the ability to list ALL errands regardless of status or who posted/
// accepted them; GET /api/errands only ever shows "mine", "assignedToMe", or
// the OPEN browse feed.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const status = searchParams.get("status") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const customerId = searchParams.get("customerId") ?? undefined;
    const runnerId = searchParams.get("runnerId") ?? undefined;
    const state = searchParams.get("state") ?? undefined;
    const city = searchParams.get("city") ?? undefined;

    const clauses: Prisma.ErrandRequestWhereInput[] = [];
    if (status) clauses.push({ status: status as Prisma.EnumErrandStatusFilter["equals"] });
    if (category) clauses.push({ category });
    if (customerId) clauses.push({ customerId });
    if (runnerId) clauses.push({ runnerId });
    if (state && city) clauses.push({ location: { is: { state, city } } });
    else if (state) clauses.push({ location: { is: { state } } });

    const where: Prisma.ErrandRequestWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.errandRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.errandRequest.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
