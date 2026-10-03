import prisma from "./prisma";
import type { WithdrawalStatus } from "@prisma/client";
import { notifyWithdrawalUpdate } from "./notificationService";

const TERMINAL_STATUSES: WithdrawalStatus[] = ["COMPLETED", "FAILED"];

export async function markWithdrawalProcessing(withdrawalId: string, providerTransferId: string) {
  const result = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: { status: "PROCESSING", providerTransferId },
  });
  if (result.count === 0) return; // already moved on — don't re-notify
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (withdrawal) {
    try {
      await notifyWithdrawalUpdate(withdrawal.accountProfileId, "PROCESSING", withdrawal.amount);
    } catch (e) {
      console.error("Failed to notify withdrawal processing:", e);
    }
  }
}

/**
 * Completes or fails a withdrawal. Idempotent: a withdrawal already in a
 * terminal state (COMPLETED/FAILED) is left untouched — the webhook and any
 * other caller can both fire for the same event without double-refunding.
 * Failure always refunds the reserved amount back to the wallet, since the
 * amount was debited up front at withdrawal-creation time, not on success.
 */
export async function resolveWithdrawal(
  withdrawalId: string,
  outcome: { success: true } | { success: false; reason: string }
) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal || TERMINAL_STATUSES.includes(withdrawal.status)) {
    return withdrawal; // already resolved or doesn't exist
  }

  if (outcome.success) {
    const claim = await prisma.withdrawal.updateMany({
      where: { id: withdrawalId, status: { notIn: TERMINAL_STATUSES } },
      data: { status: "COMPLETED", processedAt: new Date() },
    });
    if (claim.count > 0) {
      try {
        await notifyWithdrawalUpdate(withdrawal.accountProfileId, "COMPLETED", withdrawal.amount);
      } catch (e) {
        console.error("Failed to notify withdrawal completion:", e);
      }
    }
    return prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  }

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: { notIn: TERMINAL_STATUSES } },
      data: { status: "FAILED", failureReason: outcome.reason, processedAt: new Date() },
    });
    if (claim.count === 0) return null;

    const profile = await tx.accountProfile.update({
      where: { id: withdrawal.accountProfileId },
      data: { walletBalance: { increment: withdrawal.amount } },
    });
    await tx.walletTransaction.create({
      data: {
        accountProfileId: withdrawal.accountProfileId,
        type: "WITHDRAWAL_REVERSAL",
        amount: withdrawal.amount,
        balanceAfter: profile.walletBalance,
        description: `Refund for failed withdrawal: ${outcome.reason}`,
        relatedWithdrawalId: withdrawal.id,
      },
    });
    return tx.withdrawal.findUnique({ where: { id: withdrawalId } });
  });

  if (result) {
    try {
      await notifyWithdrawalUpdate(withdrawal.accountProfileId, "FAILED", withdrawal.amount);
    } catch (e) {
      console.error("Failed to notify withdrawal failure:", e);
    }
  }
  return result ?? withdrawal;
}
