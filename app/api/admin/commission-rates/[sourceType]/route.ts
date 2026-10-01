import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import type { OrderSourceType } from "@prisma/client";

interface Params {
  params: { sourceType: string };
}

const VALID_SOURCE_TYPES: OrderSourceType[] = [
  "ERRAND",
  "RFQ_QUOTATION",
  "CATALOG_PURCHASE",
  "CLEANING_BOOKING",
];

const updateRateSchema = z.object({
  rate: z.number().min(0).max(1, "Rate is a fraction of the transaction, e.g. 0.15 for 15%."),
});

// Deliberately MANAGE_COMMISSION_RATES, not the broader VIEW_ one — this is
// the one capability DEVELOPER is explicitly excluded from.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_COMMISSION_RATES");

    const sourceType = params.sourceType as OrderSourceType;
    if (!VALID_SOURCE_TYPES.includes(sourceType)) {
      throw new ApiError(400, `Invalid sourceType. Must be one of: ${VALID_SOURCE_TYPES.join(", ")}.`);
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { rate } = updateRateSchema.parse(body);

    const updated = await prisma.commissionRate.upsert({
      where: { sourceType },
      create: { sourceType, rate, updatedBy: auth.accountProfileId },
      update: { rate, updatedBy: auth.accountProfileId },
    });

    return NextResponse.json({ rate: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
