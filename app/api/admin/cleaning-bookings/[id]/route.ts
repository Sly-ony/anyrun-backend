import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/cleaning-bookings/{id} (user-facing) 403s anyone who isn't the
// customer or the provider — this is the admin bypass, same pattern as
// GET /api/admin/orders/{id}.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const booking = await prisma.cleaningBooking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "Cleaning booking not found.");

    return NextResponse.json({ booking });
  } catch (err) {
    return handleApiError(err);
  }
}
