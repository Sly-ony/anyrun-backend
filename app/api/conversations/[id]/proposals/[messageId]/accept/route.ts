import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { loadConversation, notifyNewMessage } from "@/lib/chat";
import { asAddress } from "@/lib/json";
import { hasApprovedCategoryVerification } from "@/lib/verificationRules";

interface Params {
  params: Promise<{ id: string; messageId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id, messageId } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const conv = await loadConversation(id, me);

    if (conv.post && conv.post.status !== "OPEN") {
      throw new ApiError(409, "This post is closed.");
    }

    const proposal = await prisma.message.findFirst({
      where: { id: messageId, conversationId: id, type: "PRICE_PROPOSAL" },
    });
    if (!proposal || proposal.amount == null) throw new ApiError(404, "Proposal not found.");
    if (proposal.proposalStatus !== "PENDING") {
      throw new ApiError(409, "This proposal is no longer pending.");
    }
    if (proposal.senderId === me) {
      throw new ApiError(400, "You cannot accept your own proposal.");
    }

    const active = await prisma.errandRequest.findFirst({
      where: { conversationId: id, status: { in: ["ACCEPTED", "IN_PROGRESS", "DELIVERED"] } },
      select: { id: true },
    });
    if (active) throw new ApiError(409, "A job from this chat is already in progress.");

    // Same verification gate as accepting an errand: if the post's job category
    // needs verification, the provider must be approved for it.
    let categoryName = "General";
    if (conv.post) {
      const category = await prisma.jobCategory.findUnique({ where: { id: conv.post.categoryId } });
      if (category) {
        categoryName = category.name;
        if (category.requiresVerification) {
          const verified = await hasApprovedCategoryVerification(conv.providerId, category.id);
          if (!verified) {
            throw new ApiError(
              403,
              `The "${category.name}" category requires verification before this job can be agreed. Submit it via POST /api/account/job-categories/{categoryId}/verification.`
            );
          }
        }
      }
    }

    // The errand needs a location: the post's, or else the customer's profile address.
    let location: Prisma.InputJsonValue;
    if (conv.post) {
      location = conv.post.location as Prisma.InputJsonValue;
    } else {
      const customer = await prisma.accountProfile.findUnique({
        where: { id: conv.customerId },
        select: { address: true },
      });
      if (!customer?.address) {
        throw new ApiError(409, "The customer needs an address on their profile before a job can be agreed.");
      }
      const a = asAddress(customer.address);
      location = {
        country: a.country,
        state: a.state,
        city: a.city,
        postalCode: a.postalCode ?? null,
        latitude: a.latitude ?? null,
        longitude: a.longitude ?? null,
      };
    }

    const amount = proposal.amount;
    const description = conv.post
      ? `${conv.post.title}\n\n${conv.post.description}`
      : proposal.body ?? "Job agreed in chat.";

    const { errand, system, others } = await prisma.$transaction(async (tx) => {
      // Claim the proposal first so two taps can't create two errands.
      const claimed = await tx.message.updateMany({
        where: { id: messageId, proposalStatus: "PENDING" },
        data: { proposalStatus: "ACCEPTED" },
      });
      if (claimed.count === 0) throw new ApiError(409, "This proposal is no longer pending.");

      const errand = await tx.errandRequest.create({
        data: {
          customerId: conv.customerId,
          runnerId: conv.providerId,
          description,
          category: categoryName,
          location,
          budget: amount,
          agreedPrice: amount,
          photos: [],
          status: "ACCEPTED",
          sourcePostId: conv.postId,
          conversationId: id,
        },
      });
      await tx.errandEvent.create({
        data: {
          errandId: errand.id,
          actorId: me,
          fromStatus: null,
          toStatus: "ACCEPTED",
          note: "Created from an accepted chat price",
        },
      });
      await tx.message.update({ where: { id: messageId }, data: { errandId: errand.id } });
      const system = await tx.message.create({
        data: {
          conversationId: id,
          senderId: conv.customerId,
          type: "SYSTEM",
          body: `Price of £${amount.toFixed(2)} agreed. The job is now accepted.`,
          errandId: errand.id,
        },
      });
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });

      // A NEED post is filled once one person is chosen: close it, and tell
      // everyone else who responded. (An OFFER post stays open: a provider can
      // agree jobs with several customers.)
      let others: { id: string; providerId: string }[] = [];
      if (conv.post?.type === "NEED") {
        await tx.post.update({ where: { id: conv.post.id }, data: { status: "CLOSED" } });
        others = await tx.conversation.findMany({
          where: { postId: conv.post.id, id: { not: id } },
          select: { id: true, providerId: true },
        });
        if (others.length > 0) {
          const otherIds = others.map((o) => o.id);
          await tx.message.updateMany({
            where: { conversationId: { in: otherIds }, type: "PRICE_PROPOSAL", proposalStatus: "PENDING" },
            data: { proposalStatus: "CANCELLED" },
          });
          await tx.message.createMany({
            data: otherIds.map((cid) => ({
              conversationId: cid,
              senderId: conv.customerId,
              type: "SYSTEM" as const,
              body: "The poster has chosen another provider for this post.",
            })),
          });
          await tx.conversation.updateMany({
            where: { id: { in: otherIds } },
            data: { lastMessageAt: new Date() },
          });
        }
      }
      return { errand, system, others };
    });

    await notifyNewMessage(
      proposal.senderId,
      id,
      "Price accepted",
      `Your price of £${amount.toFixed(2)} was accepted.`
    );
    for (const o of others) {
      await notifyNewMessage(
        o.providerId,
        o.id,
        "Post filled",
        "The poster has chosen another provider for this post."
      );
    }

    return NextResponse.json({ errand, message: system }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}