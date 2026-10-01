import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { manageDisputeSchema } from "@/lib/validation/dispute";
import { notifyDisputeUpdate } from "@/lib/notificationService";

interface Params {
  params: { id: string };
}

const TERMINAL_STATUSES = ["RESOLVED", "DISMISSED"];

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_DISPUTES");

    const dispute = await prisma.dispute.findUnique({ where: { id: params.id } });
    if (!dispute) throw new ApiError(404, "Dispute not found.");
    if (TERMINAL_STATUSES.includes(dispute.status)) {
      throw new ApiError(409, `This dispute is already ${dispute.status}.`);
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { status, resolutionNotes, assignedToId } = manageDisputeSchema.parse(body);

    const isTerminal = TERMINAL_STATUSES.includes(status);
    if (isTerminal && !resolutionNotes) {
      throw new ApiError(400, "resolutionNotes is required when resolving or dismissing a dispute.");
    }

    const updated = await prisma.dispute.update({
      where: { id: params.id },
      data: {
        status,
        ...(resolutionNotes !== undefined ? { resolutionNotes } : {}),
        ...(assignedToId !== undefined ? { assignedToId } : {}),
        ...(isTerminal ? { resolvedAt: new Date() } : {}),
      },
    });

    try {
      const message = isTerminal
        ? `Your dispute "${dispute.subject}" was marked ${status}${resolutionNotes ? `: ${resolutionNotes}` : "."}`
        : `Your dispute "${dispute.subject}" is now ${status}.`;
      await notifyDisputeUpdate(dispute.raisedById, message);
    } catch (e) {
      console.error("Failed to notify dispute raiser of status change:", e);
    }

    return NextResponse.json({ dispute: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
