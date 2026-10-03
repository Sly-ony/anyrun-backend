import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new ApiError(404, "Notification not found.");
    if (notification.recipientId !== auth.accountProfileId) {
      throw new ApiError(403, "You do not have permission to modify this notification.");
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json({ notification: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
