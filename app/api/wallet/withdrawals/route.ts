import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createWithdrawalSchema } from "@/lib/validation/wallet";
import { parsePagination } from "@/lib/pagination";

// Withdrawals are MANUAL: this creates a PENDING request and reserves the
// funds; it does not call any payment gateway. Support/admin pulls the
// pending list (GET /api/admin/withdrawals?status=PENDING, optionally
// &format=csv for a printable sheet), pays each one by bank transfer
// outside the system, then marks it paid or rejects it via
// POST /api/admin/withdrawals/{id}/complete | /reject.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { amount, payoutMethodId } = createWithdrawalSchema.parse(body);

    const payoutMethod = await prisma.payoutMethod.findUnique({ where: { id: payoutMethodId } });
    if (!payoutMethod) throw new ApiError(404, "Payout method not found.");
    if (payoutMethod.accountProfileId !== auth.accountProfileId) {
      throw new ApiError(403, "You do not own this payout method.");
    }

    // Funds are reserved (debited) the moment a request is created — this
    // is what makes "insufficient balance" race-safe (two concurrent
    // requests can't both succeed against the same balance), and why a
    // rejection must explicitly refund (see resolveWithdrawal).
    const reference = `wd_${randomUUID()}`;
    const withdrawal = await prisma.$transaction(async (tx) => {
      const profile = await tx.accountProfile.findUnique({ where: { id: auth.accountProfileId } });
      if (!profile) throw new ApiError(404, "Account not found.");
      if (profile.walletBalance < amount) throw new ApiError(409, "Insufficient wallet balance.");

      const created = await tx.withdrawal.create({
        data: {
          accountProfileId: auth.accountProfileId,
          payoutMethodId: payoutMethod.id,
          amount,
          currency: payoutMethod.currency,
          status: "PENDING",
          reference,
        },
      });

      const updatedProfile = await tx.accountProfile.update({
        where: { id: auth.accountProfileId },
        data: { walletBalance: { decrement: amount } },
      });

      await tx.walletTransaction.create({
        data: {
          accountProfileId: auth.accountProfileId,
          type: "WITHDRAWAL",
          amount,
          balanceAfter: updatedProfile.walletBalance,
          description: `Withdrawal request to ${payoutMethod.bankName} (${payoutMethod.accountNumber.slice(-4).padStart(payoutMethod.accountNumber.length, "*")})`,
          relatedWithdrawalId: created.id,
        },
      });

      return created;
    });

    return NextResponse.json({ withdrawal }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);

    const where = { accountProfileId: auth.accountProfileId };

    const [items, total] = await Promise.all([
      prisma.withdrawal.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.withdrawal.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
