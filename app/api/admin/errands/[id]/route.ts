import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { logAdminAction } from "@/lib/auditLog";
import { sanitizeUser } from "@/lib/user";
import { getRiskStats } from "@/lib/risk";

interface Params {
  params: Promise<{ id: string }>;
}

async function partyCard(profileId: string) {
  const profile = await prisma.accountProfile.findUnique({
    where: { id: profileId },
    include: { user: true },
  });
  if (!profile) return null;
  const involved = { OR: [{ customerId: profileId }, { runnerId: profileId }] };
  const [jobsCompleted, jobsCancelled, disputesRaised, disputesAgainst, risk] = await Promise.all([
    prisma.errandRequest.count({ where: { status: "COMPLETED", ...involved } }),
    prisma.errandRequest.count({ where: { status: "CANCELLED", ...involved } }),
    prisma.dispute.count({ where: { raisedById: profileId } }),
    prisma.dispute.count({ where: { againstId: profileId } }),
    getRiskStats(profileId),
  ]);
  const { user, ...rest } = profile;
  return {
    user: sanitizeUser(user),
    profile: rest,
    stats: { jobsCompleted, jobsCancelled, disputesRaised, disputesAgainst },
    risk: { level: risk.level, reasons: risk.reasons, cancelRate: risk.cancelRate },
  };
}

// Everything about one job, for dispute review. Chat messages are included only
// when the job has a dispute, and every view is written to the audit log.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_DISPUTES");

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    const [customer, runner, post, order, deliveryJob, disputes, timeline, conversation, reviews] =
      await Promise.all([
        partyCard(errand.customerId),
        errand.runnerId ? partyCard(errand.runnerId) : Promise.resolve(null),
        errand.sourcePostId
          ? prisma.post.findUnique({
              where: { id: errand.sourcePostId },
              select: { id: true, title: true, description: true, type: true, status: true, createdAt: true },
            })
          : Promise.resolve(null),
        prisma.orderTx.findUnique({ where: { sourceErrandId: id }, include: { payment: true } }),
        prisma.deliveryJob.findUnique({ where: { errandRequestId: id } }),
        prisma.dispute.findMany({
          where: { relatedType: "ERRAND", relatedId: id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.errandEvent.findMany({ where: { errandId: id }, orderBy: { createdAt: "asc" } }),
        errand.conversationId
          ? prisma.conversation.findUnique({ where: { id: errand.conversationId } })
          : Promise.resolve(null),
        prisma.review.findMany({ where: { errandId: id }, orderBy: { createdAt: "asc" } }),
      ]);

    let messages = null;
    if (conversation && disputes.length > 0) {
      const rows = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 1000,
      });
      const originals = await prisma.messageOriginal.findMany({
        where: { messageId: { in: rows.filter((m) => m.flagged).map((m) => m.id) } },
      });
      const originalById = new Map(originals.map((o) => [o.messageId, o.body]));
      messages = rows.map((m) => ({
        ...m,
        originalBody: originalById.get(m.id) ?? null,
        senderRole:
          m.type === "SYSTEM"
            ? "SYSTEM"
            : m.senderId === conversation.customerId
              ? "CUSTOMER"
              : m.senderId === conversation.providerId
                ? "PROVIDER"
                : "UNKNOWN",
      }));
    }

    await logAdminAction(auth.accountProfileId, "ERRAND_CASE_VIEWED", "ErrandRequest", id, {
      messagesIncluded: messages !== null,
    });

    return NextResponse.json({
      errand,
      customer,
      runner,
      post,
      conversationId: conversation?.id ?? null,
      messages, // null = no dispute yet, or the job did not come from a chat
      order,
      deliveryJob,
      disputes,
      timeline,
      reviews,
    });
  } catch (err) {
    return handleApiError(err);
  }
}