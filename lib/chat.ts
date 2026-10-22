import type { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { ApiError } from "./apiError";

export const PARTY_SELECT = {
  id: true,
  accountKind: true,
  businessName: true,
  user: { select: { name: true, avatarUrl: true } },
} satisfies Prisma.AccountProfileSelect;

export const CONVERSATION_INCLUDE = {
  post: { select: { id: true, title: true, type: true, status: true } },
  customer: { select: PARTY_SELECT },
  provider: { select: PARTY_SELECT },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.ConversationInclude;

export type ConversationFull = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;

type Party = Prisma.AccountProfileGetPayload<{ select: typeof PARTY_SELECT }>;

function shapeParty(p: Party) {
  return {
    id: p.id,
    name: p.user.name,
    avatarUrl: p.user.avatarUrl,
    accountKind: p.accountKind,
    businessName: p.businessName,
  };
}

export async function shapeConversation(c: ConversationFull, me: string) {
  const iAmCustomer = c.customerId === me;
  const lastRead = iAmCustomer ? c.customerLastReadAt : c.providerLastReadAt;
  const unreadCount = await prisma.message.count({
    where: {
      conversationId: c.id,
      senderId: { not: me },
      ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
    },
  });
  return {
    id: c.id,
    myRole: iAmCustomer ? ("CUSTOMER" as const) : ("PROVIDER" as const),
    otherParty: shapeParty(iAmCustomer ? c.provider : c.customer),
    post: c.post,
    lastMessage: c.messages[0] ?? null,
    unreadCount,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
  };
}

/** Loads a chat the caller belongs to. 404 (not 403) so chat ids can't be probed. */
export async function loadConversation(id: string, me: string) {
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: { post: true },
  });
  if (!c || (c.customerId !== me && c.providerId !== me)) {
    throw new ApiError(404, "Conversation not found.");
  }
  return c;
}

export function readField(c: { customerId: string }, me: string) {
  return c.customerId === me ? "customerLastReadAt" : "providerLastReadAt";
}

/**
 * Best-effort notification. With `dedupe`, plain text messages only notify when
 * the recipient has no unread chat notification already, so a fast back-and-forth
 * doesn't flood the inbox.
 */
export async function notifyNewMessage(
  recipientId: string,
  conversationId: string,
  title: string,
  message: string,
  dedupe = false
) {
  try {
    if (dedupe) {
      const existing = await prisma.notification.findFirst({
        where: { recipientId, type: "NEW_MESSAGE", relatedConversationId: conversationId, isRead: false },
        select: { id: true },
      });
      if (existing) return;
    }
    await prisma.notification.create({
      data: { recipientId, type: "NEW_MESSAGE", title, message, relatedConversationId: conversationId },
    });
  } catch (e) {
    console.error("Failed to send chat notification:", e);
  }
}

export function preview(text: string | null | undefined, max = 100) {
  if (!text) return "Sent an attachment.";
  return text.length > max ? text.slice(0, max) + "…" : text;
}