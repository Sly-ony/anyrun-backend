import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { loadConversation, readField, notifyNewMessage, preview } from "@/lib/chat";

interface Params {
  params: Promise<{ id: string }>;
}

const sendSchema = z
  .object({
    body: z.string().trim().min(1).max(4000).optional(),
    attachmentUrls: z.array(z.string().url()).max(10).optional(),
  })
  .refine((d) => !!d.body || (d.attachmentUrls?.length ?? 0) > 0, {
    message: "Send a message body or at least one attachment.",
    path: ["body"],
  });

// GET /api/conversations/{id}/messages
//   (no params)   latest page, oldest first
//   ?before=<id>  older page (scroll up)
//   ?since=<ISO>  polling: every message created OR changed at/after that time
//                 (a price proposal changes status when accepted or declined)
// Opening the chat marks it as read.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const conv = await loadConversation(id, me);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const sinceParam = searchParams.get("since");
    const beforeId = searchParams.get("before");

    let items;
    let hasMore = false;

    if (sinceParam) {
      const since = new Date(sinceParam);
      if (isNaN(since.getTime())) throw new ApiError(400, "since must be an ISO date-time.");
      items = await prisma.message.findMany({
        where: { conversationId: id, updatedAt: { gte: since } },
        orderBy: { updatedAt: "asc" },
        take: 200,
      });
    } else {
      let createdBefore: Date | undefined;
      if (beforeId) {
        const cursor = await prisma.message.findFirst({ where: { id: beforeId, conversationId: id } });
        if (!cursor) throw new ApiError(400, "Unknown before cursor.");
        createdBefore = cursor.createdAt;
      }
      const rows = await prisma.message.findMany({
        where: { conversationId: id, ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).reverse();
    }

    if (!sinceParam || items.length > 0) {
      await prisma.conversation.update({
        where: { id },
        data: { [readField(conv, me)]: new Date() },
      });
    }

    return NextResponse.json({ items, hasMore });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/conversations/{id}/messages   { body?, attachmentUrls? }
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const conv = await loadConversation(id, me);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = sendSchema.parse(body);

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: id,
          senderId: me,
          type: "TEXT",
          body: d.body,
          attachmentUrls: d.attachmentUrls ?? [],
        },
      }),
      prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), [readField(conv, me)]: new Date() },
      }),
    ]);

    const recipientId = me === conv.customerId ? conv.providerId : conv.customerId;
    await notifyNewMessage(recipientId, id, "New message", preview(d.body), true);

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}