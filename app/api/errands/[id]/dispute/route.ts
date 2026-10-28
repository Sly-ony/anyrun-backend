import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { notifyDisputeUpdate } from "@/lib/notificationService";

interface Params {
  params: Promise<{ id: string }>;
}

const disputeSchema = z.object({
  subject: z.string().trim().min(3, "Give the problem a short title.").max(150),
  description: z.string().trim().min(10, "Describe what happened.").max(4000),
  evidenceUrls: z.array(z.string().url()).max(10).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    const isCustomer = errand.customerId === me;
    const isRunner = errand.runnerId === me;
    if (!isCustomer && !isRunner) throw new ApiError(403, "You are not a party to this job.");
    if (!errand.runnerId) throw new ApiError(409, "This job has no other party yet.");

    const mineOpen = await prisma.dispute.findFirst({
      where: {
        relatedType: "ERRAND",
        relatedId: id,
        raisedById: me,
        status: { in: ["OPEN", "IN_REVIEW"] },
      },
      select: { id: true },
    });
    if (mineOpen) throw new ApiError(409, "You already have an open dispute on this job.");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = disputeSchema.parse(body);

    const otherId = isCustomer ? errand.runnerId : errand.customerId;
    const dispute = await prisma.dispute.create({
      data: {
        raisedById: me,
        againstId: otherId,
        relatedType: "ERRAND",
        relatedId: id,
        subject: d.subject,
        description: d.description,
        evidenceUrls: d.evidenceUrls ?? [],
      },
    });

    try {
      await notifyDisputeUpdate(
        otherId,
        "A problem was reported on a job you are part of. The job is paused while our team reviews it."
      );
    } catch (e) {
      console.error("Failed to notify the other party of the dispute:", e);
    }

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}