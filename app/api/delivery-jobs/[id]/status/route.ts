import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { deliveryStatusChangeSchema } from "@/lib/validation/delivery";
import { checkDeliveryTransition } from "@/lib/deliveryStateMachine";
import { resolveDeliveryRequesterId } from "@/lib/deliveryAuth";
import { notifyDeliveryUpdate } from "@/lib/notificationService";

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
    const isRequester = requesterId === auth.accountProfileId;
    const isAssignee = job.assigneeId === auth.accountProfileId;
    if (!isRequester && !isAssignee) {
      throw new ApiError(403, "You are not a party to this delivery job.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { status: nextStatus } = deliveryStatusChangeSchema.parse(body);

    const actor: "requester" | "assignee" = isRequester ? "requester" : "assignee";
    const error = checkDeliveryTransition(job.status, nextStatus, actor);
    if (error) throw new ApiError(409, error);

    const updated = await prisma.deliveryJob.update({
      where: { id },
      data: { status: nextStatus },
    });

    try {
      const recipientId = actor === "requester" ? job.assigneeId : requesterId;
      if (recipientId) {
        await notifyDeliveryUpdate(updated, recipientId, `Delivery status updated to ${nextStatus}.`);
      }
    } catch (e) {
      console.error("Failed to notify counterpart of delivery status change:", e);
    }

    return NextResponse.json({ job: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
