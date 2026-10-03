import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const order = await prisma.orderTx.findUnique({ where: { id } });
    if (!order) throw new ApiError(404, "Order not found.");

    if (order.payerId !== auth.accountProfileId && order.payeeId !== auth.accountProfileId) {
      throw new ApiError(403, "You do not have permission to view this order.");
    }

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });

    return NextResponse.json({ order, payment });
  } catch (err) {
    return handleApiError(err);
  }
}
