import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { errandStatusChangeSchema } from "@/lib/validation/errand";
import { checkErrandTransition } from "@/lib/errandStateMachine";
import { assertNoOpenErrandDispute } from "@/lib/disputeRules";
import { releaseEscrow, refundEscrow } from "@/lib/escrow";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const errand = await prisma.errandRequest.findUnique({ where: { id } });
    if (!errand) throw new ApiError(404, "Errand request not found.");

    const isCustomer = errand.customerId === auth.accountProfileId;
    const isProvider = errand.runnerId === auth.accountProfileId;
    if (!isCustomer && !isProvider) {
      throw new ApiError(403, "You are not a party to this job.");
    }

    await assertNoOpenErrandDispute(id);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { status: nextStatus } = errandStatusChangeSchema.parse(body);

    const actor: "customer" | "provider" = isCustomer ? "customer" : "provider";
    const error = checkErrandTransition(errand.status, nextStatus, actor);
    if (error) throw new ApiError(409, error);

    // Jobs agreed in chat must be funded (money held) before work can start.
    if (errand.status === "ACCEPTED" && nextStatus === "IN_PROGRESS" && errand.agreedPrice != null) {
      const order = await prisma.orderTx.findUnique({ where: { sourceErrandId: id } });
      if (!order || order.escrowStatus !== "HELD") {
        throw new ApiError(
          409,
          "The customer has not paid yet. Wait until the payment is held before you start work."
        );
      }
    }

    const { updated, escrow } = await prisma.$transaction(async (tx) => {
      const changed = await tx.errandRequest.updateMany({
        where: { id, status: errand.status },
        data: {
          status: nextStatus,
          ...(nextStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        },
      });
      if (changed.count === 0) {
        throw new ApiError(409, "This job was just changed. Refresh and try again.");
      }
      await tx.errandEvent.create({
        data: {
          errandId: id,
          actorId: auth.accountProfileId,
          fromStatus: errand.status,
          toStatus: nextStatus,
        },
      });

      let escrow: "RELEASED" | "REFUNDED" | null = null;
      if (nextStatus === "COMPLETED") {
        escrow = (await releaseEscrow(tx, id)) ? "RELEASED" : null;
      } else if (nextStatus === "CANCELLED") {
        escrow = (await refundEscrow(tx, id)) ? "REFUNDED" : null;
      }

      const updated = await tx.errandRequest.findUnique({ where: { id } });
      return { updated, escrow };
    });

    // escrow: "RELEASED" = money paid to the provider, "REFUNDED" = returned
    // to the customer, null = no held money (old-style job: customer pays
    // via POST /api/errands/[id]/pay after completion).
    return NextResponse.json({ errand: updated, escrow });
  } catch (err) {
    return handleApiError(err);
  }
}