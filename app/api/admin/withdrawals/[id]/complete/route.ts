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

const completeSchema = z.object({
  // The bank transfer reference/ID the admin got when paying it out by hand.
  payoutReference: z.string().min(1, "payoutReference is required."),
});

// Call this AFTER you've actually sent the bank transfer manually.
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
    const { payoutReference } = completeSchema.parse(body);

    const updated = await resolveWithdrawal(
      id,
      { success: true },
      { processedBy: auth.accountProfileId, payoutReference }
    );

    await logAdminAction(auth.accountProfileId, "WITHDRAWAL_COMPLETED", "Withdrawal", id, {
      amount: withdrawal.amount,
      payoutReference,
    });

    return NextResponse.json({ withdrawal: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
