import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createAndChargeOrder } from "@/lib/orderService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const booking = await prisma.cleaningBooking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "Cleaning booking not found.");

    if (booking.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who made this booking can pay for it.");
    }
    if (booking.status !== "COMPLETED") {
      throw new ApiError(409, "A booking can only be paid once it is marked COMPLETED.");
    }
    if (booking.price == null) {
      throw new ApiError(409, "This booking has no price set to charge.");
    }

    const existing = await prisma.orderTx.findUnique({
      where: { sourceCleaningBookingId: booking.id },
    });
    if (existing) {
      throw new ApiError(409, "This booking has already been paid for.");
    }

    const { order, payment } = await createAndChargeOrder({
      sourceType: "CLEANING_BOOKING",
      amount: booking.price,
      payerId: booking.customerId,
      payeeId: booking.providerId,
      description: `Payment for cleaning booking ${booking.id}`,
      sourceCleaningBookingId: booking.id,
    });

    return NextResponse.json({ order, payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
