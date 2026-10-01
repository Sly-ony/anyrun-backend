import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateRfqSchema } from "@/lib/validation/rfq";
import { SUPPLIER_ROLE } from "@/lib/roles";

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const rfq = await prisma.rFQ.findUnique({ where: { id: params.id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    const isBuyer = rfq.buyerId === auth.accountProfileId;

    // Buyers see every quotation submitted; a supplier only ever sees their
    // own — competitors' pricing is never exposed to each other.
    const quotations = isBuyer
      ? await prisma.quotation.findMany({ where: { rfqId: rfq.id }, orderBy: { createdAt: "desc" } })
      : auth.roles.includes(SUPPLIER_ROLE)
        ? await prisma.quotation.findMany({
            where: { rfqId: rfq.id, supplierId: auth.accountProfileId },
          })
        : [];

    return NextResponse.json({ rfq, quotations });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const rfq = await prisma.rFQ.findUnique({ where: { id: params.id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    if (rfq.buyerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the buyer who posted this RFQ can edit it.");
    }
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "An RFQ can only be edited while it is still OPEN.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateRfqSchema.parse(body);

    const updated = await prisma.rFQ.update({
      where: { id: params.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.deadline !== undefined ? { deadline: data.deadline } : {}),
        // Line items are only replaced wholesale on edit — partial line-item
        // patching would orphan any quotation already referencing old itemIds.
        ...(data.lineItems !== undefined
          ? {
              lineItems: data.lineItems.map((item, i) => ({
                itemId: rfq.lineItems[i]?.itemId ?? randomUUID(),
                name: item.name,
                quantity: item.quantity,
                notes: item.notes,
              })),
            }
          : {}),
      },
    });

    return NextResponse.json({ rfq: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

// Soft-close rather than delete, to keep a full audit trail of RFQs the
// buyer walked away from.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);

    const rfq = await prisma.rFQ.findUnique({ where: { id: params.id } });
    if (!rfq) throw new ApiError(404, "RFQ not found.");

    if (rfq.buyerId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the buyer who posted this RFQ can close it.");
    }
    if (rfq.status !== "OPEN") {
      throw new ApiError(409, "This RFQ is already closed or awarded.");
    }

    const updated = await prisma.rFQ.update({
      where: { id: params.id },
      data: { status: "CLOSED" },
    });

    return NextResponse.json({ rfq: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
