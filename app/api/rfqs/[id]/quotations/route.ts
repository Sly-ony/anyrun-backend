import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createQuotationSchema } from "@/lib/validation/quotation";
import { SUPPLIER_ROLE } from "@/lib/roles";
import { notifyQuotationReceived } from "@/lib/notificationService";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireRole(auth, [SUPPLIER_ROLE]);

    const rfq = await prisma.rFQ.findUnique({ where: { id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "This RFQ is no longer accepting quotations.");
    }
    if (rfq.buyerId === auth.accountProfileId) {
      throw new ApiError(400, "You cannot quote on your own RFQ.");
    }

    const existing = await prisma.quotation.findFirst({
      where: { rfqId: rfq.id, supplierId: auth.accountProfileId, status: "SUBMITTED" },
    });
    if (existing) {
      throw new ApiError(
        409,
        "You already have a submitted quotation on this RFQ — update or withdraw it instead."
      );
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createQuotationSchema.parse(body);

    const totalPrice =
      data.totalPrice ?? data.lineItems.reduce((sum, item) => sum + item.price, 0);

    const quotation = await prisma.quotation.create({
      data: {
        rfqId: rfq.id,
        supplierId: auth.accountProfileId,
        lineItems: data.lineItems,
        totalPrice,
        notes: data.notes,
        status: "SUBMITTED",
      },
    });

    try {
      await notifyQuotationReceived(rfq, quotation);
    } catch (e) {
      console.error("Failed to notify buyer of new quotation:", e);
    }

    return NextResponse.json({ quotation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const rfq = await prisma.rFQ.findUnique({ where: { id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    const isBuyer = rfq.buyerId === auth.accountProfileId;

    if (isBuyer) {
      const quotations = await prisma.quotation.findMany({
        where: { rfqId: rfq.id },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ quotations });
    }

    if (auth.roles.includes(SUPPLIER_ROLE)) {
      const quotations = await prisma.quotation.findMany({
        where: { rfqId: rfq.id, supplierId: auth.accountProfileId },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ quotations });
    }

    throw new ApiError(403, "You do not have permission to view quotations on this RFQ.");
  } catch (err) {
    return handleApiError(err);
  }
}
