import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { loadConversation, readField, notifyNewMessage } from "@/lib/chat";

interface Params {
  params: Promise<{ id: string }>;
}

const proposalSchema = z.object({
  amount: z.number().positive("Amount must be greater than zero.").max(1_000_000),
  note: z.string().trim().max(1000).optional(),
});

// Either side can propose a price; the other side accepts or declines.
// A new proposal replaces any pending one in the same chat.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const conv = await loadConversation(id, me);

    if (conv.post && conv.post.status !== "OPEN") {
      throw new ApiError(409, "This post is closed.");
    }
    const active = await prisma.errandRequest.findFirst({
      where: { conversationId: id, status: { in: ["ACCEPTED", "IN_PROGRESS", "DELIVERED"] } },
      select: { id: true },
    });
    if (active) throw new ApiError(409, "A job from this chat is already in progress.");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = proposalSchema.parse(body);
    const amount = Math.round(d.amount * 100) / 100;

    const message = await prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { conversationId: id, type: "PRICE_PROPOSAL", proposalStatus: "PENDING" },
        data: { proposalStatus: "CANCELLED" },
      });
      const m = await tx.message.create({
        data: {
          conversationId: id,
          senderId: me,
          type: "PRICE_PROPOSAL",
          body: d.note,
          amount,
          proposalStatus: "PENDING",
        },
      });
      await tx.conversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), [readField(conv, me)]: new Date() },
      });
      return m;
    });

    const recipientId = me === conv.customerId ? conv.providerId : conv.customerId;
    await notifyNewMessage(recipientId, id, "New price proposal", `A price of £${amount.toFixed(2)} was proposed.`);

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}