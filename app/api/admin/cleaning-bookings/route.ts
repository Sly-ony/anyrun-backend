import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const status = searchParams.get("status") ?? undefined;
    const customerId = searchParams.get("customerId") ?? undefined;
    const serviceScope = searchParams.get("serviceScope") ?? undefined;

    const clauses: Prisma.CleaningBookingWhereInput[] = [];
    if (status) clauses.push({ status: status as Prisma.EnumCleaningBookingStatusFilter["equals"] });
    if (customerId) clauses.push({ customerId });
    if (serviceScope) clauses.push({ serviceScope: serviceScope as Prisma.EnumCleaningServiceScopeFilter["equals"] });
    // No providerId filter — there's only ever the one seeded provider.

    const where: Prisma.CleaningBookingWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.cleaningBooking.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.cleaningBooking.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
