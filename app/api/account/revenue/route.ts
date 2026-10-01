import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError } from "@/lib/apiError";
import type { OrderSourceType, Prisma } from "@prisma/client";

const SOURCE_TYPES: OrderSourceType[] = [
  "ERRAND",
  "RFQ_QUOTATION",
  "CATALOG_PURCHASE",
  "CLEANING_BOOKING",
];

// The user-facing counterpart to GET /api/admin/revenue — same shape,
// scoped to the caller instead of the whole platform. Defaults to "my
// earnings" (role=payee): what a runner/supplier/cleaning provider has
// actually been paid, net of commission. Pass role=payer for "my spending"
// instead.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);

    const role = searchParams.get("role") === "payer" ? "payer" : "payee";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const paymentStatusParam = searchParams.get("paymentStatus") ?? "PAID";

    const dateRange: Prisma.DateTimeFilter | undefined =
      startDate || endDate
        ? { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) }
        : undefined;

    const baseWhere: Prisma.OrderTxWhereInput = {
      [role === "payer" ? "payerId" : "payeeId"]: auth.accountProfileId,
      ...(paymentStatusParam !== "ALL" ? { paymentStatus: paymentStatusParam as Prisma.EnumPaymentStatusFilter["equals"] } : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
    };

    const bySourceType = await Promise.all(
      SOURCE_TYPES.map(async (sourceType) => {
        const agg = await prisma.orderTx.aggregate({
          where: { ...baseWhere, sourceType },
          _count: { _all: true },
          _sum: { amount: true, commissionAmount: true },
        });
        const grossAmount = agg._sum.amount ?? 0;
        const commissionAmount = agg._sum.commissionAmount ?? 0;
        return {
          sourceType,
          orderCount: agg._count._all,
          grossAmount,
          commissionAmount,
          // What you actually received/paid net of commission — the number
          // that matters on an earnings view, as opposed to admin's revenue
          // view where commissionAmount itself is the figure of interest.
          netAmount: role === "payee" ? grossAmount - commissionAmount : grossAmount,
        };
      })
    );

    const totals = bySourceType.reduce(
      (acc, row) => ({
        orderCount: acc.orderCount + row.orderCount,
        grossAmount: acc.grossAmount + row.grossAmount,
        commissionAmount: acc.commissionAmount + row.commissionAmount,
        netAmount: acc.netAmount + row.netAmount,
      }),
      { orderCount: 0, grossAmount: 0, commissionAmount: 0, netAmount: 0 }
    );

    const response: Record<string, unknown> = {
      role,
      range: { startDate: startDate ?? null, endDate: endDate ?? null },
      paymentStatusFilter: paymentStatusParam,
      totals,
      bySourceType,
    };

    // Delivery earnings only make sense on the payee ("what have I earned as
    // the person who did the delivery") side — carries no commission, so the
    // full amount is the figure of interest, same as the admin view.
    if (role === "payee") {
      const myDeliveryJobs = await prisma.deliveryJob.findMany({
        where: { assigneeId: auth.accountProfileId },
        select: { id: true },
      });
      const deliveryWhere: Prisma.PaymentWhereInput = {
        sourceType: "DELIVERY_JOB",
        deliveryJobId: { in: myDeliveryJobs.map((j) => j.id) },
        ...(paymentStatusParam !== "ALL" ? { status: paymentStatusParam as Prisma.EnumPaymentStatusFilter["equals"] } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
      };
      const deliveryAgg = await prisma.payment.aggregate({
        where: deliveryWhere,
        _count: { _all: true },
        _sum: { amount: true },
      });
      response.deliveryEarnings = {
        jobCount: deliveryAgg._count._all,
        totalAmount: deliveryAgg._sum.amount ?? 0,
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    return handleApiError(err);
  }
}
