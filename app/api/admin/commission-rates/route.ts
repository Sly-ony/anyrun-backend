import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { getEnvDefaultRate } from "@/lib/commission";
import type { OrderSourceType } from "@prisma/client";

const SOURCE_TYPES: OrderSourceType[] = [
  "ERRAND",
  "RFQ_QUOTATION",
  "CATALOG_PURCHASE",
  "CLEANING_BOOKING",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_COMMISSION_RATES");

    const overrides = await prisma.commissionRate.findMany();
    const overrideMap = new Map(overrides.map((o) => [o.sourceType, o]));

    const rates = SOURCE_TYPES.map((sourceType) => {
      const override = overrideMap.get(sourceType);
      return {
        sourceType,
        rate: override?.rate ?? getEnvDefaultRate(sourceType),
        source: override ? "database_override" : "env_default",
        updatedAt: override?.updatedAt ?? null,
        updatedBy: override?.updatedBy ?? null,
      };
    });

    return NextResponse.json({ rates });
  } catch (err) {
    return handleApiError(err);
  }
}
