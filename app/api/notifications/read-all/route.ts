import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { handleApiError } from "@/lib/apiError";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const result = await prisma.notification.updateMany({
      where: { recipientId: auth.accountProfileId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ updatedCount: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
