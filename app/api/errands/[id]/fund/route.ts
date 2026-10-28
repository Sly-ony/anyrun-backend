import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { fundErrand } from "@/lib/escrow";
import { assertNoOpenErrandDispute } from "@/lib/disputeRules";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Job not found.");
    if (errand.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer can pay for this job.");
    }
    if (errand.status !== "ACCEPTED") {
      throw new ApiError(409, "A job can only be funded after the price is agreed and before work starts.");
    }

    await assertNoOpenErrandDispute(id);

    const { order, payment } = await fundErrand(errand);
    return NextResponse.json({ order, payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}