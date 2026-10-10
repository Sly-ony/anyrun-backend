import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createRfqSchema } from "@/lib/validation/rfq";
import { RFQ_BUYER_ROLES, SUPPLIER_ROLE } from "@/lib/roles";
import { anyRegionMatch } from "@/lib/region";
import { parsePagination } from "@/lib/pagination";
import { notifyNewRfq } from "@/lib/notificationService";
import { hasApprovedBusinessVerification } from "@/lib/verificationRules";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireRole(auth, RFQ_BUYER_ROLES);

    if (!(await hasApprovedBusinessVerification(auth.accountProfileId))) {
      throw new ApiError(
        403,
        "Business verification is required before posting an RFQ. Submit documents via POST /api/account/business-verification."
      );
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createRfqSchema.parse(body);

    const rfq = await prisma.rFQ.create({
      data: {
        buyerId: auth.accountProfileId,
        title: data.title,
        lineItems: data.lineItems.map((item) => ({
          itemId: randomUUID(),
          name: item.name,
          quantity: item.quantity,
          notes: item.notes ?? null,
        })),
        region: data.region,
        deadline: data.deadline,
        status: "OPEN",
      },
    });

    try {
      await notifyNewRfq(rfq);
    } catch (e) {
      console.error("Failed to notify suppliers of new RFQ:", e);
    }

    return NextResponse.json({ rfq }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const mine = searchParams.get("mine") === "true";
    const statusParam = searchParams.get("status") ?? undefined;

    const clauses: Prisma.RFQWhereInput[] = [];

    if (mine) {
      clauses.push({ buyerId: auth.accountProfileId });
    } else {
      clauses.push({ status: "OPEN" });

      if (auth.roles.includes(SUPPLIER_ROLE)) {
        const profile = await prisma.accountProfile.findUnique({
          where: { id: auth.accountProfileId },
          select: { serviceRegions: true },
        });
        // Cast the JsonValue to an array type so TS knows .length exists and anyRegionMatch accepts it
        const regions = (profile?.serviceRegions as unknown as any[]) ?? [];
        if (regions.length > 0) {
          clauses.push(anyRegionMatch("region", regions));
        }
      }
    }

    if (statusParam) {
      clauses.push({ status: statusParam as Prisma.EnumRFQStatusFilter["equals"] });
    }

    const where: Prisma.RFQWhereInput = { AND: clauses };

    const [items, total] = await Promise.all([
      prisma.rFQ.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.rFQ.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
