import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { loadConversation, notifyNewMessage } from "@/lib/chat";

interface Params {
  params: Promise<{ id: string; messageId: string }>;
}

// The recipient declines; the sender withdraws (status CANCELLED).
export async function POST(request: NextRequest, { params }: Params) {
  const { id, messageId } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    await loadConversation(id, me);

    const proposal = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id, type: "PRICE_PROPOSAL" },
    });
    if (!proposal) throw new ApiError(404, "Proposal not found.");

    const status = proposal.senderId === me ? "CANCELLED" : "DECLINED";
    const result = await prisma.message.updateMany({
      where: { id: messageId, proposalStatus: "PENDING" },
      data: { proposalStatus: status },
    });
    if (result.count === 0) throw new ApiError(409, "This proposal is no longer pending.");

    if (status === "DECLINED") {
      await notifyNewMessage(proposal.senderId, id, "Price declined", "Your price proposal was declined.");
    }

    const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    return NextResponse.json({ message });
  } catch (err) {
    return handleApiError(err);
  }
}