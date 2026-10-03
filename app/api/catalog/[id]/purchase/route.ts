import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createAndChargeOrder } from "@/lib/orderService";

interface Params {
  params: Promise<{ id: string }>;
}

const purchaseSchema = z.object({
  quantity: z.number().int().positive().optional().default(1),
});

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, "Catalog item not found.");
    if (!item.isAvailable) throw new ApiError(409, "This item is no longer available.");
    if (item.supplierId === auth.accountProfileId) {
      throw new ApiError(400, "You cannot purchase your own catalog item.");
    }

    const body = await request.json().catch(() => ({}));
    const { quantity } = purchaseSchema.parse(body);

    const { order, payment } = await createAndChargeOrder({
      sourceType: "CATALOG_PURCHASE",
      amount: item.price * quantity,
      payerId: auth.accountProfileId,
      payeeId: item.supplierId,
      description: `Purchase of ${quantity} x ${item.title}`,
      sourceCatalogItemId: item.id,
    });

    return NextResponse.json({ order, payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
