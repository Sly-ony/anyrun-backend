import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { awardRfqSchema } from "@/lib/validation/rfq";
import { notifyQuotationAwarded } from "@/lib/notificationService";

interface Params {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const rfq = await prisma.rFQ.findUnique({ where: { id: params.id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    if (rfq.buyerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the buyer who posted this RFQ can award it.");
    }
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "This RFQ has already been awarded or closed.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { quotationIds } = awardRfqSchema.parse(body);

    const candidates = await prisma.quotation.findMany({
      where: { id: { in: quotationIds }, rfqId: rfq.id },
    });
    if (candidates.length !== quotationIds.length) {
      throw new ApiError(400, "One or more quotationIds do not belong to this RFQ.");
    }
    const notSubmitted = candidates.find((q) => q.status !== "SUBMITTED");
    if (notSubmitted) {
      throw new ApiError(409, `Quotation ${notSubmitted.id} is not in a SUBMITTED state.`);
    }

    const losingQuotations = await prisma.quotation.findMany({
      where: { rfqId: rfq.id, status: "SUBMITTED", id: { notIn: quotationIds } },
    });

    const [, , updatedRfq] = await prisma.$transaction([
      // Winners
      prisma.quotation.updateMany({
        where: { id: { in: quotationIds } },
        data: { status: "ACCEPTED" },
      }),
      // Everyone else who quoted on this RFQ loses.
      prisma.quotation.updateMany({
        where: { rfqId: rfq.id, id: { notIn: quotationIds }, status: "SUBMITTED" },
        data: { status: "REJECTED" },
      }),
      prisma.rFQ.update({
        where: { id: rfq.id },
        data: {
          status: "AWARDED",
          // The schema only carries a single "primary" awarded reference;
          // when several suppliers are awarded (e.g. split by line item),
          // this points at the first and Quotation.status = ACCEPTED remains
          // the authoritative list of every winner for this RFQ.
          awardedQuotationId: quotationIds[0],
        },
      }),
    ]);

    const winningQuotations = await prisma.quotation.findMany({
      where: { id: { in: quotationIds } },
    });

    try {
      await notifyQuotationAwarded(winningQuotations, losingQuotations);
    } catch (e) {
      console.error("Failed to notify suppliers of RFQ award outcome:", e);
    }

    // Awarding and billing are kept as separate steps on purpose: the buyer
    // pays each winning quotation explicitly via POST
    // /api/quotations/[id]/pay, so a payment failure never blocks (or gets
    // conflated with) the award decision itself.

    return NextResponse.json({ rfq: updatedRfq, awardedQuotations: winningQuotations });
  } catch (err) {
    return handleApiError(err);
  }
}
