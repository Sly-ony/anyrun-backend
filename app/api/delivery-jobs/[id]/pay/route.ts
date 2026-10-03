import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { resolveDeliveryRequesterId } from "@/lib/deliveryAuth";
import { chargeDeliveryJob } from "@/lib/deliveryPaymentService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const job = await prisma.deliveryJob.findUnique({ where: { id } });
    if (!job) throw new ApiError(404, "Delivery job not found.");

    const requesterId = await resolveDeliveryRequesterId(job);
    if (requesterId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the requester of this delivery job can pay for it.");
    }
    if (!job.assigneeId) {
      throw new ApiError(409, "This delivery job has no assigned runner to pay yet.");
    }

    const { payment } = await chargeDeliveryJob(job.id, requesterId, job.assigneeId);

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
