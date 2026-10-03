import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { createWithdrawalSchema } from "@/lib/validation/wallet";
import { getGatewayAdapter } from "@/lib/payments";
import { markWithdrawalProcessing, resolveWithdrawal } from "@/lib/withdrawalService";
import { parsePagination } from "@/lib/pagination";

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
    if (!payoutMethod.providerRecipientCode) {
      throw new ApiError(409, "This payout method is not fully registered with its provider yet.");
    }

    // Funds are reserved (debited) the moment a withdrawal is created, not
    // when it eventually completes — this is what makes "insufficient
    // balance" checks race-safe (two concurrent withdrawal requests can't
    // both succeed against the same balance) and is why a failed transfer
    // must explicitly refund (see resolveWithdrawal).
    const reference = `wd_${randomUUID()}`;
    const withdrawal = await prisma.$transaction(async (tx) => {
      const profile = await tx.accountProfile.findUnique({ where: { id: auth.accountProfileId } });
      if (!profile) throw new ApiError(404, "Account not found.");
      if (profile.walletBalance < amount) throw new ApiError(409, "Insufficient wallet balance.");

      const created = await tx.withdrawal.create({
        data: {
          accountProfileId: auth.accountProfileId,
          provider: payoutMethod.provider,
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
          description: `Withdrawal to ${payoutMethod.bankName} (${payoutMethod.accountNumber.slice(-4).padStart(payoutMethod.accountNumber.length, "*")})`,
          relatedWithdrawalId: created.id,
        },
      });

      return created;
    });

    const adapter = getGatewayAdapter(payoutMethod.provider);
    try {
      const result = await adapter.initiateTransfer({
        amount,
        currency: payoutMethod.currency,
        reference,
        reason: `Anyrun wallet withdrawal for ${auth.accountProfileId}`,
        recipient: {
          accountName: payoutMethod.accountName,
          accountNumber: payoutMethod.accountNumber,
          bankCode: payoutMethod.bankCode,
          providerRecipientCode: payoutMethod.providerRecipientCode,
        },
      });

      if (result.success) {
        await markWithdrawalProcessing(withdrawal.id, result.providerTransferId);
      } else {
        await resolveWithdrawal(withdrawal.id, {
          success: false,
          reason: result.failureReason ?? "Gateway rejected the transfer.",
        });
      }
    } catch (err) {
      await resolveWithdrawal(withdrawal.id, {
        success: false,
        reason: err instanceof Error ? err.message : "Unknown transfer error.",
      });
    }

    const final = await prisma.withdrawal.findUnique({ where: { id: withdrawal.id } });
    return NextResponse.json({ withdrawal: final }, { status: 201 });
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
