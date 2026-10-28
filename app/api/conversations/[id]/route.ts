import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { CONVERSATION_INCLUDE, shapeConversation } from "@/lib/chat";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;

    const c = await prisma.conversation.findUnique({
      where: { id },
      include: CONVERSATION_INCLUDE,
    });
    if (!c || (c.customerId !== me && c.providerId !== me)) {
      throw new ApiError(404, "Conversation not found.");
    }

    // The job agreed in this chat, if any: lets the UI show progress and a Pay button.
    const errand = await prisma.errandRequest.findFirst({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, agreedPrice: true },
    });

    let underDispute = false;
    let escrowStatus: string = "NONE";
    if (errand) {
      const [dispute, order] = await Promise.all([
        prisma.dispute.findFirst({
          where: { relatedType: "ERRAND", relatedId: errand.id, status: { in: ["OPEN", "IN_REVIEW"] } },
          select: { id: true },
        }),
        prisma.orderTx.findUnique({
          where: { sourceErrandId: errand.id },
          select: { escrowStatus: true },
        }),
      ]);
      underDispute = !!dispute;
      escrowStatus = order?.escrowStatus ?? "NONE";
    }

    return NextResponse.json({
      conversation: await shapeConversation(c, me),
      errand: errand ? { ...errand, underDispute, escrowStatus } : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}