import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { RUNNER_ROLE } from "@/lib/roles";
import { resolveDeliveryRequesterId } from "@/lib/deliveryAuth";
import { notifyDeliveryUpdate } from "@/lib/notificationService";

interface Params {
  params: { id: string };
}

// NOTE: until there's a proper dispatch/admin system for the founder's own
// delivery company, any RUNNER-role account can self-assign an open delivery
// job — same pattern as errand acceptance. Worth revisiting once delivery
// staff become their own concept distinct from marketplace runners.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, [RUNNER_ROLE]);

    const job = await prisma.deliveryJob.findUnique({ where: { id: params.id } });
    if (!job) throw new ApiError(404, "Delivery job not found.");
    if (job.status !== "REQUESTED") {
      throw new ApiError(409, "This delivery job is no longer available for assignment.");
    }
    if (job.assigneeId) {
      throw new ApiError(409, "This delivery job has already been assigned.");
    }

    const result = await prisma.deliveryJob.updateMany({
      where: { id: params.id, status: "REQUESTED", assigneeId: null },
      data: { status: "ASSIGNED", assigneeId: auth.accountProfileId },
    });
    if (result.count === 0) {
      throw new ApiError(409, "This delivery job was just assigned to someone else.");
    }

    const updated = await prisma.deliveryJob.findUnique({ where: { id: params.id } });
    if (updated) {
      try {
        const requesterId = await resolveDeliveryRequesterId(updated);
        await notifyDeliveryUpdate(updated, requesterId, "A runner has been assigned to your delivery.");
      } catch (e) {
        console.error("Failed to notify requester of delivery assignment:", e);
      }
    }
    return NextResponse.json({ job: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
