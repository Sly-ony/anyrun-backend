import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import type { OrderSourceType, Prisma } from "@prisma/client";

const SOURCE_TYPES: OrderSourceType[] = [
  "ERRAND",
  "RFQ_QUOTATION",
  "CATALOG_PURCHASE",
  "CLEANING_BOOKING",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    // Revenue is realized commission, so PAID is the default — pass
    // paymentStatus=ALL to include PENDING/FAILED orders in the counts too.
    const paymentStatusParam = searchParams.get("paymentStatus") ?? "PAID";

    const dateRange: Prisma.DateTimeFilter | undefined =
      startDate || endDate
        ? { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) }
        : undefined;

    const baseWhere: Prisma.OrderTxWhereInput = {
      ...(paymentStatusParam !== "ALL" ? { paymentStatus: paymentStatusParam as Prisma.EnumPaymentStatusFilter["equals"] } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
    };

    const bySourceType = await Promise.all(
      SOURCE_TYPES.map(async (sourceType) => {
        const where: Prisma.OrderTxWhereInput = { ...baseWhere, sourceType };
        const agg = await prisma.orderTx.aggregate({
          where,
          _count: { _all: true },
          _sum: { amount: true, commissionAmount: true },
        });
        return {
          sourceType,
          orderCount: agg._count._all,
          grossAmount: agg._sum.amount ?? 0,
          commissionAmount: agg._sum.commissionAmount ?? 0,
        };
      })
    );

    const totals = bySourceType.reduce(
      (acc, row) => ({
        orderCount: acc.orderCount + row.orderCount,
        grossAmount: acc.grossAmount + row.grossAmount,
        commissionAmount: acc.commissionAmount + row.commissionAmount,
      }),
      { orderCount: 0, grossAmount: 0, commissionAmount: 0 }
    );

    // Delivery fees are shown separately and explicitly NOT folded into
    // totals above — they carry no platform commission (the fee goes
    // entirely to the delivery company), so they aren't "revenue" in the
    // same sense, just payment volume worth visibility into.
    const deliveryWhere: Prisma.PaymentWhereInput = {
      sourceType: "DELIVERY_JOB",
      ...(paymentStatusParam !== "ALL" ? { status: paymentStatusParam as Prisma.EnumPaymentStatusFilter["equals"] } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
    };
    const deliveryAgg = await prisma.payment.aggregate({
      where: deliveryWhere,
      _count: { _all: true },
      _sum: { amount: true },
    });

    return NextResponse.json({
      range: { startDate: startDate ?? null, endDate: endDate ?? null },
      paymentStatusFilter: paymentStatusParam,
      totals,
      bySourceType,
      deliveryFees: {
        jobCount: deliveryAgg._count._all,
        totalAmount: deliveryAgg._sum.amount ?? 0,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
