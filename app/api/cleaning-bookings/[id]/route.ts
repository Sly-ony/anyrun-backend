import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateCleaningBookingSchema } from "@/lib/validation/cleaningBooking";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const booking = await prisma.cleaningBooking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "Cleaning booking not found.");

    const isCustomer = booking.customerId === auth.accountProfileId;
    const isProvider = booking.providerId === auth.accountProfileId;
    if (!isCustomer && !isProvider) {
      throw new ApiError(403, "You do not have permission to view this booking.");
    }

    return NextResponse.json({ booking });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const booking = await prisma.cleaningBooking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "Cleaning booking not found.");
    if (booking.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who made this booking can edit it.");
    }
    if (booking.status !== "PENDING") {
      throw new ApiError(409, "A booking can only be edited while it is still PENDING.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateCleaningBookingSchema.parse(body);

    const updated = await prisma.cleaningBooking.update({ where: { id }, data });
    return NextResponse.json({ booking: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
