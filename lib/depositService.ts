import prisma from "./prisma";
import { notifyDepositUpdate } from "./notificationService";

/**
 * Marks a PENDING deposit COMPLETED and credits the wallet, or marks it
 * FAILED — but only if it's still PENDING. The webhook and the user polling
 * GET /api/wallet/deposits/{id} can both call this for the same deposit (a
 * race is likely: webhook arrives while the user's browser is still polling
 * after checkout redirect); the conditional `updateMany` below means only
 * the first caller actually applies the change, the second is a no-op.
 */
export async function completeDeposit(
  depositId: string,
  outcome: { success: true; amount: number; providerReference: string } | { success: false; providerReference?: string }
) {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.status !== "PENDING") {
    return deposit; // already resolved (or doesn't exist) — nothing to do
  }

  if (outcome.success) {
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.deposit.updateMany({
        where: { id: depositId, status: "PENDING" },
        data: { status: "COMPLETED", providerReference: outcome.providerReference, paidAt: new Date() },
      });
      if (claim.count === 0) return null; // someone else (webhook vs. poll race) already completed it

      const profile = await tx.accountProfile.update({
        where: { id: deposit.accountProfileId },
        data: { walletBalance: { increment: outcome.amount } },
      });
      await tx.walletTransaction.create({
        data: {
          accountProfileId: deposit.accountProfileId,
          type: "DEPOSIT",
          amount: outcome.amount,
          balanceAfter: profile.walletBalance,
          description: `Wallet top-up via ${deposit.provider}`,
          relatedDepositId: deposit.id,
        },
      });
      return tx.deposit.findUnique({ where: { id: depositId } });
    });

    if (result) {
      try {
        await notifyDepositUpdate(deposit.accountProfileId, true, outcome.amount);
      } catch (e) {
        console.error("Failed to notify deposit success:", e);
      }
    }
    return result ?? deposit;
  }

  const claim = await prisma.deposit.updateMany({
    where: { id: depositId, status: "PENDING" },
    data: {
      status: "FAILED",
      ...(outcome.providerReference ? { providerReference: outcome.providerReference } : {}),
    },
  });
  if (claim.count > 0) {
    try {
      await notifyDepositUpdate(deposit.accountProfileId, false, deposit.amount);
    } catch (e) {
      console.error("Failed to notify deposit failure:", e);
    }
  }
  return prisma.deposit.findUnique({ where: { id: depositId } });
}
