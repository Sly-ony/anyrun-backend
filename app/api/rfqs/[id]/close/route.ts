import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

// Same effect as DELETE /api/rfqs/[id] — provided as an explicit action verb
// for clients/UIs that prefer POST-to-an-action over semantic DELETE.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const rfq = await prisma.rFQ.findUnique({ where: { id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    if (rfq.buyerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the buyer who posted this RFQ can close it.");
    }
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "This RFQ is already closed or awarded.");
    }

    const updated = await prisma.rFQ.update({
      where: { id },
      data: { status: "CLOSED" },
    });

    return NextResponse.json({ rfq: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
