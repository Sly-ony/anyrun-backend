import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const role = searchParams.get("role"); // "payer" | "payee" | omitted (both)

    let where: Prisma.OrderTxWhereInput;
    if (role === "payer") where = { payerId: auth.accountProfileId };
    else if (role === "payee") where = { payeeId: auth.accountProfileId };
    else where = { OR: [{ payerId: auth.accountProfileId }, { payeeId: auth.accountProfileId }] };

    const [items, total] = await Promise.all([
      prisma.orderTx.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.orderTx.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
