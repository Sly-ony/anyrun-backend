import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { hasCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createDisputeSchema } from "@/lib/validation/dispute";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = createDisputeSchema.parse(body);

    const dispute = await prisma.dispute.create({
      data: {
        raisedById: auth.accountProfileId,
        againstId: data.againstId,
        relatedType: data.relatedType,
        relatedId: data.relatedId,
        subject: data.subject,
        description: data.description,
        status: "OPEN",
      },
    });

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const statusParam = searchParams.get("status") ?? undefined;

    const canManage = hasCapability(auth.adminRole, "MANAGE_DISPUTES");

    const where: Prisma.DisputeWhereInput = {
      ...(canManage ? {} : { raisedById: auth.accountProfileId }),
      ...(statusParam ? { status: statusParam as Prisma.EnumDisputeStatusFilter["equals"] } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.dispute.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.dispute.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
