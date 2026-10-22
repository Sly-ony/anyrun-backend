import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import {
  CONVERSATION_INCLUDE,
  shapeConversation,
  notifyNewMessage,
  preview,
} from "@/lib/chat";

const startSchema = z
  .object({
    postId: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    message: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((d) => !!d.postId !== !!d.accountId, {
    message: "Send either postId or accountId.",
    path: ["postId"],
  });

// POST /api/conversations  { postId } or { accountId }, optional first { message }
// postId: chat with the post's author. A NEED post's author is the customer;
//   an OFFER post's author is the provider.
// accountId: chat from someone's profile. The person who starts it is the
//   customer and the profile owner is the provider.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = startSchema.parse(body);

    let customerId: string;
    let providerId: string;
    let postId: string | null = null;
    let postClosed = false;

    if (d.postId) {
      const post = await prisma.post.findUnique({
        where: { id: d.postId },
        include: { author: { select: { isActive: true } } },
      });
      if (!post || !post.author.isActive) throw new ApiError(404, "Post not found.");
      if (post.authorId === me) throw new ApiError(400, "You cannot message yourself.");
      postId = post.id;
      postClosed = post.status !== "OPEN";
      if (post.type === "NEED") {
        customerId = post.authorId;
        providerId = me;
      } else {
        customerId = me;
        providerId = post.authorId;
      }
    } else {
      const target = await prisma.accountProfile.findFirst({
        where: { id: d.accountId!, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!target) throw new ApiError(404, "Account not found.");
      if (target.id === me) throw new ApiError(400, "You cannot message yourself.");
      customerId = me;
      providerId = target.id;
    }

    let conversation = await prisma.conversation.findFirst({
      where: { customerId, providerId, postId },
    });
    const created = !conversation;

    if (!conversation) {
      if (postClosed) throw new ApiError(409, "This post is closed.");
      const now = new Date();
      conversation = await prisma.conversation.create({
        data: {
          customerId,
          providerId,
          postId,
          ...(me === customerId ? { customerLastReadAt: now } : { providerLastReadAt: now }),
        },
      });
    }

    if (d.message) {
      await prisma.$transaction([
        prisma.message.create({
          data: { conversationId: conversation.id, senderId: me, type: "TEXT", body: d.message },
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        }),
      ]);
      const recipientId = me === customerId ? providerId : customerId;
      await notifyNewMessage(recipientId, conversation.id, "New message", preview(d.message), true);
    }

    const full = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: CONVERSATION_INCLUDE,
    });

    return NextResponse.json(
      { conversation: await shapeConversation(full, me), created },
      { status: created ? 201 : 200 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

// GET /api/conversations?page=&pageSize=   my chats, most recent first
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const where = { OR: [{ customerId: me }, { providerId: me }] };
    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: CONVERSATION_INCLUDE,
        orderBy: { lastMessageAt: "desc" },
        skip,
        take,
      }),
      prisma.conversation.count({ where }),
    ]);

    const items = await Promise.all(rows.map((r) => shapeConversation(r, me)));
    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}