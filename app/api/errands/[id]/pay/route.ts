import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createAndChargeOrder } from "@/lib/orderService";
import { assertNoOpenErrandDispute } from "@/lib/disputeRules";

interface Params {
  params: Promise<{ id: string }>;
}

// Old-style payment after completion. Jobs agreed in chat are paid up front
// with POST /api/errands/[id]/fund and released automatically on completion,
// so this endpoint only serves jobs that have no order yet.
const paySchema = z.object({
  amount: z.number().positive("Amount must be greater than zero.").optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    if (errand.customerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the customer who posted this job can pay for it.");
    }
    if (errand.status !== "COMPLETED") {
      throw new ApiError(409, "A job can only be paid once it is marked COMPLETED.");
    }
    if (!errand.runnerId) {
      throw new ApiError(409, "This job has no provider to pay.");
    }

    const existing = await prisma.orderTx.findUnique({
      where: { sourceErrandId: errand.id },
    });
    if (existing) {
      throw new ApiError(
        409,
        existing.escrowStatus === "NONE"
          ? "This job has already been paid for."
          : "This job was paid up front. The money is released to the provider when the job is completed."
      );
    }

    await assertNoOpenErrandDispute(id);

    const body = await request.json().catch(() => ({}));
    const parsed = paySchema.parse(body);

    let amount: number;
    if (errand.agreedPrice != null) {
      if (parsed.amount !== undefined && Math.abs(parsed.amount - errand.agreedPrice) > 0.005) {
        throw new ApiError(400, `Amount must match the agreed price of ${errand.agreedPrice.toFixed(2)}.`);
      }
      amount = errand.agreedPrice;
    } else {
      if (parsed.amount === undefined) throw new ApiError(400, "amount is required.");
      amount = parsed.amount;
    }

    const { order, payment } = await createAndChargeOrder({
      sourceType: "ERRAND",
      amount,
      payerId: errand.customerId,
      payeeId: errand.runnerId,
      description: `Payment for errand ${errand.id}`,
      sourceErrandId: errand.id,
    });

    return NextResponse.json({ order, payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}