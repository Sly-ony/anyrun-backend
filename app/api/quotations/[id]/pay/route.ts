import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createAndChargeOrder } from "@/lib/orderService";

interface Params {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const quotation = await prisma.quotation.findUnique({ where: { id: params.id } });
    if (!quotation) throw new ApiError(404, "Quotation not found.");

    const rfq = await prisma.rFQ.findUnique({ where: { id: quotation.rfqId } });
    if (!rfq) throw new ApiError(404, "Parent RFQ not found.");

    if (rfq.buyerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the buyer who posted this RFQ can pay for a quotation.");
    }
    if (quotation.status !== "ACCEPTED") {
      throw new ApiError(409, "Only an ACCEPTED (awarded) quotation can be paid.");
    }
    if (quotation.totalPrice == null) {
      throw new ApiError(409, "This quotation has no total price to charge.");
    }

    const existing = await prisma.orderTx.findUnique({
      where: { sourceQuotationId: quotation.id },
    });
    if (existing) {
      throw new ApiError(409, "This quotation has already been paid for.");
    }

    const { order, payment } = await createAndChargeOrder({
      sourceType: "RFQ_QUOTATION",
      amount: quotation.totalPrice,
      payerId: rfq.buyerId,
      payeeId: quotation.supplierId,
      description: `Payment for quotation ${quotation.id} on RFQ ${rfq.id}`,
      sourceQuotationId: quotation.id,
    });

    return NextResponse.json({ order, payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
