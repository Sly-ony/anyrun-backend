import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateQuotationSchema } from "@/lib/validation/quotation";

interface Params {
  params: Promise<{ id: string }>;
}

async function loadQuotationWithRfq(id: string) {
  const quotation = await prisma.quotation.findUnique({ where: { id } });
  if (!quotation) throw new ApiError(404, "Quotation not found.");
  const rfq = await prisma.rFQ.findUnique({ where: { id: quotation.rfqId } });
  if (!rfq) throw new ApiError(404, "Parent RFQ not found.");
  return { quotation, rfq };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const { quotation, rfq } = await loadQuotationWithRfq(id);

    const isOwner = quotation.supplierId === auth.accountProfileId;
    const isBuyer = rfq.buyerId === auth.accountProfileId;
    if (!isOwner && !isBuyer) {
      throw new ApiError(403, "You do not have permission to view this quotation.");
    }

    return NextResponse.json({ quotation });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const { quotation, rfq } = await loadQuotationWithRfq(id);

    if (quotation.supplierId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the submitting supplier can edit this quotation.");
    }
    if (quotation.status !== "SUBMITTED") {
      throw new ApiError(409, "Only a SUBMITTED quotation can be edited.");
    }
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "This RFQ is no longer open, so its quotations are locked.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateQuotationSchema.parse(body);

    const totalPrice =
      data.totalPrice ??
      (data.lineItems ? data.lineItems.reduce((sum, item) => sum + item.price, 0) : undefined);

    const updated = await prisma.quotation.update({
      where: { id },
      data: {
        ...(data.lineItems !== undefined ? { lineItems: data.lineItems } : {}),
        ...(totalPrice !== undefined ? { totalPrice } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });

    return NextResponse.json({ quotation: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

// Hard delete: a withdrawn draft quotation has no audit value once gone,
// unlike an ACCEPTED/REJECTED decision (which we never allow deleting here).
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const { quotation, rfq } = await loadQuotationWithRfq(id);

    if (quotation.supplierId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the submitting supplier can withdraw this quotation.");
    }
    if (quotation.status !== "SUBMITTED") {
      throw new ApiError(409, "Only a SUBMITTED quotation can be withdrawn.");
    }
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "This RFQ is no longer open, so its quotations are locked.");
    }

    await prisma.quotation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
