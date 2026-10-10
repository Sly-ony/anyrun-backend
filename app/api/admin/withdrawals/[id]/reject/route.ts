import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { resolveWithdrawal } from "@/lib/withdrawalService";
import { logAdminAction } from "@/lib/auditLog";

interface Params {
  params: Promise<{ id: string }>;
}

const rejectSchema = z.object({
  reason: z.string().min(1, "A rejection reason is required."),
});

// Rejecting refunds the reserved amount back to the user's wallet
// automatically (WITHDRAWAL_REVERSAL ledger entry) and notifies them.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_WITHDRAWALS");

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new ApiError(404, "Withdrawal not found.");
    if (withdrawal.status !== "PENDING") {
      throw new ApiError(409, `This withdrawal is already ${withdrawal.status}.`);
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { reason } = rejectSchema.parse(body);

    const updated = await resolveWithdrawal(
      id,
      { success: false, reason },
      { processedBy: auth.accountProfileId }
    );

    await logAdminAction(auth.accountProfileId, "WITHDRAWAL_REJECTED", "Withdrawal", id, {
      amount: withdrawal.amount,
      reason,
    });

    return NextResponse.json({ withdrawal: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
