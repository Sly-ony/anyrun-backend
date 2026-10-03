import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const where = { accountProfileId: auth.accountProfileId };

    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.walletTransaction.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
