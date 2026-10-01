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
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const where = {
      recipientId: auth.accountProfileId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { recipientId: auth.accountProfileId, isRead: false } }),
    ]);

    return NextResponse.json({ items, page, pageSize, total, unreadCount });
  } catch (err) {
    return handleApiError(err);
  }
}
