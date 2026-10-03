import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const job = await prisma.deliveryJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Delivery job not found.");

    const payment = await prisma.payment.findUnique({ where: { deliveryJobId: job.id } });

    return NextResponse.json({ job, payment });
  } catch (err) {
    return handleApiError(err);
  }
}
