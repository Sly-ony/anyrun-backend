import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: { id: string };
}

// GET /api/orders/{id} (the user-facing route) 403s anyone who isn't the
// payer or payee — which includes admins, by design, since that endpoint
// has no awareness of admin capabilities. This is the bypass.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const order = await prisma.orderTx.findUnique({ where: { id: params.id } });
    if (!order) throw new ApiError(404, "Order not found.");

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });

    return NextResponse.json({ order, payment });
  } catch (err) {
    return handleApiError(err);
  }
}
