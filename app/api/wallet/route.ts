import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError } from "@/lib/apiError";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const profile = await prisma.accountProfile.findUnique({
      where: { id: auth.accountProfileId },
      select: { walletBalance: true },
    });

    return NextResponse.json({ walletBalance: profile?.walletBalance ?? 0, currency: "GBP" });
  } catch (err) {
    return handleApiError(err);
  }
}
