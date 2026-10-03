import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new ApiError(404, "Withdrawal not found.");
    if (withdrawal.accountProfileId !== auth.accountProfileId) {
      throw new ApiError(403, "You do not have permission to view this withdrawal.");
    }

    return NextResponse.json({ withdrawal });
  } catch (err) {
    return handleApiError(err);
  }
}
