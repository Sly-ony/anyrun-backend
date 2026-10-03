import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { cleaningStatusChangeSchema } from "@/lib/validation/cleaningBooking";
import { checkCleaningTransition } from "@/lib/cleaningBookingStateMachine";
import { notifyCleaningBookingUpdate } from "@/lib/notificationService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const booking = await prisma.cleaningBooking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "Cleaning booking not found.");

    const isCustomer = booking.customerId === auth.accountProfileId;
    const isProvider = booking.providerId === auth.accountProfileId;
    if (!isCustomer && !isProvider) {
      throw new ApiError(403, "You are not a party to this booking.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { status: nextStatus, price } = cleaningStatusChangeSchema.parse(body);

    const actor: "customer" | "provider" = isCustomer ? "customer" : "provider";
    const error = checkCleaningTransition(booking.status, nextStatus, actor);
    if (error) throw new ApiError(409, error);

    if (nextStatus === "CONFIRMED" && price === undefined && booking.price == null) {
      throw new ApiError(400, "A price must be set when confirming this booking.");
    }

    const updated = await prisma.cleaningBooking.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(price !== undefined ? { price } : {}),
      },
    });

    try {
      const recipientId = isCustomer ? booking.providerId : booking.customerId;
      await notifyCleaningBookingUpdate(updated, recipientId, `Booking status updated to ${nextStatus}.`);
    } catch (e) {
      console.error("Failed to notify counterpart of cleaning booking status change:", e);
    }

    return NextResponse.json({ booking: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
