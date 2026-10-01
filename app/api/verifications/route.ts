import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError } from "@/lib/apiError";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const verifications = await prisma.verification.findMany({
      where: { accountProfileId: auth.accountProfileId },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json({ verifications });
  } catch (err) {
    return handleApiError(err);
  }
}
