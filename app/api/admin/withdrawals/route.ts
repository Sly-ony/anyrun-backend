import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const status = searchParams.get("status") ?? undefined;
    const provider = searchParams.get("provider") ?? undefined;
    const accountProfileId = searchParams.get("accountProfileId") ?? undefined;

    const where: Prisma.WithdrawalWhereInput = {
      ...(status ? { status: status as Prisma.EnumWithdrawalStatusFilter["equals"] } : {}),
      ...(provider ? { provider: provider as Prisma.EnumPaymentGatewayFilter["equals"] } : {}),
      ...(accountProfileId ? { accountProfileId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.withdrawal.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.withdrawal.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
