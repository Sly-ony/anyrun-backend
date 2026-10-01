import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createDeliveryJobSchema } from "@/lib/validation/delivery";
import { RUNNER_ROLE } from "@/lib/roles";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createDeliveryJobSchema.parse(body);

    // Verify the caller actually owns the thing they're requesting delivery
    // for, whichever kind it is.
    if (data.errandRequestId) {
      const errand = await prisma.errandRequest.findUnique({
        where: { id: data.errandRequestId },
      });
      if (!errand) throw new ApiError(404, "Errand request not found.");
      if (errand.customerId !== auth.accountProfileId) {
        throw new ApiError(403, "Only the customer who posted this errand can request delivery for it.");
      }
      const existing = await prisma.deliveryJob.findUnique({
        where: { errandRequestId: errand.id },
      });
      if (existing) throw new ApiError(409, "A delivery job already exists for this errand.");
    } else if (data.relatedOrderId) {
      const order = await prisma.orderTx.findUnique({ where: { id: data.relatedOrderId } });
      if (!order) throw new ApiError(404, "Order not found.");
      if (order.payerId !== auth.accountProfileId) {
        throw new ApiError(403, "Only the buyer of this order can request delivery for it.");
      }
      if (order.paymentStatus !== "PAID") {
        throw new ApiError(409, "Delivery can only be requested for a PAID order.");
      }
    }

    const job = await prisma.deliveryJob.create({
      data: {
        errandRequestId: data.errandRequestId,
        relatedOrderId: data.relatedOrderId,
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        deliveryFee: data.deliveryFee,
        scheduledAt: data.scheduledAt,
        status: "REQUESTED",
      },
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const assignedToMe = searchParams.get("assignedToMe") === "true";

    let where: Prisma.DeliveryJobWhereInput;

    if (assignedToMe) {
      requireRole(auth, [RUNNER_ROLE]);
      where = { assigneeId: auth.accountProfileId };
    } else {
      // "Mine" here means jobs the caller requested, which requires walking
      // through their errands/orders since DeliveryJob has no requesterId
      // field of its own.
      const [myErrands, myOrders] = await Promise.all([
        prisma.errandRequest.findMany({
          where: { customerId: auth.accountProfileId },
          select: { id: true },
        }),
        prisma.orderTx.findMany({
          where: { payerId: auth.accountProfileId },
          select: { id: true },
        }),
      ]);
      where = {
        OR: [
          { errandRequestId: { in: myErrands.map((e) => e.id) } },
          { relatedOrderId: { in: myOrders.map((o) => o.id) } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      prisma.deliveryJob.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.deliveryJob.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
