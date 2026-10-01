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

    const sourceType = searchParams.get("sourceType") ?? undefined;
    const paymentStatus = searchParams.get("paymentStatus") ?? undefined;
    const payerId = searchParams.get("payerId") ?? undefined;
    const payeeId = searchParams.get("payeeId") ?? undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const clauses: Prisma.OrderTxWhereInput[] = [];
    if (sourceType) clauses.push({ sourceType: sourceType as Prisma.EnumOrderSourceTypeFilter["equals"] });
    if (paymentStatus) clauses.push({ paymentStatus: paymentStatus as Prisma.EnumPaymentStatusFilter["equals"] });
    if (payerId) clauses.push({ payerId });
    if (payeeId) clauses.push({ payeeId });
    if (startDate || endDate) {
      clauses.push({
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate ? { lte: new Date(endDate) } : {}),
        },
      });
    }

    const where: Prisma.OrderTxWhereInput = clauses.length ? { AND: clauses } : {};

    const [items, total] = await Promise.all([
      prisma.orderTx.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.orderTx.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
