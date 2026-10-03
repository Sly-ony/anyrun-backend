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
    const assigneeId = searchParams.get("assigneeId") ?? undefined;

    const clauses: Prisma.DeliveryJobWhereInput[] = [];
    if (status) clauses.push({ status: status as Prisma.EnumDeliveryStatusFilter["equals"] });
    if (assigneeId) clauses.push({ assigneeId });

    const where: Prisma.DeliveryJobWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.deliveryJob.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.deliveryJob.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
