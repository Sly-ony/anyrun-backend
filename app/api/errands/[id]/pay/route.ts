import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createAndChargeOrder } from "@/lib/orderService";

interface Params {
  params: Promise<{ id: string }>;
}

// For a job agreed in chat the price is already fixed (errand.agreedPrice), so
// "amount" is optional and must match it. For older errands with no agreed
// price, the payer still states the amount explicitly.
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
      throw new ApiError(403, "Only the customer who posted this errand can pay for it.");
    }
    if (errand.status !== "COMPLETED") {
      throw new ApiError(409, "An errand can only be paid once it is marked COMPLETED.");
    }
    if (!errand.runnerId) {
      throw new ApiError(409, "This errand has no assigned runner to pay.");
    }

    const existing = await prisma.orderTx.findUnique({
      where: { sourceErrandId: errand.id },
    });
    if (existing) {
      throw new ApiError(409, "This errand has already been paid for.");
    }

    const body = await request.json().catch(() => ({}));
    const parsed = paySchema.parse(body);

    let amount: number;
    if (errand.agreedPrice != null) {
      // Agreed in chat: the payer can't change it.
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