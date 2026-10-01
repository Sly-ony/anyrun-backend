import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createCleaningBookingSchema } from "@/lib/validation/cleaningBooking";
import { getActiveCleaningProvider } from "@/lib/cleaningProvider";
import { notifyCleaningBookingUpdate } from "@/lib/notificationService";
import { parsePagination } from "@/lib/pagination";

// Deliberately no role restriction here: "both individuals and businesses
// can book cleaning jobs" per the brief, and there's no reason a RUNNER or
// BUSINESS_SUPPLIER couldn't book a cleaning for their own premises either.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createCleaningBookingSchema.parse(body);

    // providerId is never client-supplied — it always resolves to the one
    // seeded provider account, never something a caller can choose.
    const provider = await getActiveCleaningProvider();

    const booking = await prisma.cleaningBooking.create({
      data: {
        customerId: auth.accountProfileId,
        providerId: provider.id,
        serviceScope: data.serviceScope,
        address: data.address,
        scheduledDate: data.scheduledDate,
        notes: data.notes,
        price: data.price,
        status: "PENDING",
      },
    });

    try {
      await notifyCleaningBookingUpdate(
        booking,
        provider.id,
        `New ${data.serviceScope.toLowerCase()} cleaning booking request for ${data.scheduledDate.toDateString()}.`
      );
    } catch (e) {
      console.error("Failed to notify cleaning provider of new booking:", e);
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const asProvider = searchParams.get("asProvider") === "true";

    const where = asProvider
      ? { providerId: auth.accountProfileId }
      : { customerId: auth.accountProfileId };

    // asProvider=true only returns anything for the one seeded provider
    // account anyway (the where clause naturally yields zero rows for
    // anyone else) — no extra role check needed.

    const [items, total] = await Promise.all([
      prisma.cleaningBooking.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.cleaningBooking.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
