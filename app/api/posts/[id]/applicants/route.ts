import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import { CONVERSATION_INCLUDE, shapeConversation } from "@/lib/chat";

interface Params {
  params: Promise<{ id: string }>;
}

// People who started a chat about this post. Author only.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!post) throw new ApiError(404, "Post not found.");
    if (post.authorId !== me) {
      throw new ApiError(403, "Only the author can see who has responded to this post.");
    }

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const where = { postId: id };

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

    const items = await Promise.all(
      rows.map(async (r) => {
        const [chat, latestProposal, errand] = await Promise.all([
          shapeConversation(r, me),
          prisma.message.findFirst({
            where: { conversationId: r.id, type: "PRICE_PROPOSAL" },
            orderBy: { createdAt: "desc" },
            select: { id: true, amount: true, proposalStatus: true, senderId: true, createdAt: true },
          }),
          prisma.errandRequest.findFirst({
            where: { conversationId: r.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true, agreedPrice: true },
          }),
        ]);
        return { ...chat, latestProposal, errand };
      })
    );

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}