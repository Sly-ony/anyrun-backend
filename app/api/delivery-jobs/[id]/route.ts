import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { resolveDeliveryRequesterId } from "@/lib/deliveryAuth";

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const job = await prisma.deliveryJob.findUnique({ where: { id: params.id } });
    if (!job) throw new ApiError(404, "Delivery job not found.");

    const requesterId = await resolveDeliveryRequesterId(job);
    const isRequester = requesterId === auth.accountProfileId;
    const isAssignee = job.assigneeId === auth.accountProfileId;

    if (!isRequester && !isAssignee) {
      throw new ApiError(403, "You do not have permission to view this delivery job.");
    }

    // DeliveryJob payments don't route through OrderTx (no commission is
    // taken), so this is the only place to read one back after the fact.
    const payment = await prisma.payment.findUnique({ where: { deliveryJobId: job.id } });

    return NextResponse.json({ job, payment });
  } catch (err) {
    return handleApiError(err);
  }
}
