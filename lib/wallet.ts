import type { WalletTransactionType } from "@prisma/client";
import prisma from "./prisma";
import { ApiError } from "./apiError";

export interface WalletLedgerRefs {
  relatedDepositId?: string;
  relatedWithdrawalId?: string;
  relatedOrderId?: string;
  relatedDeliveryJobId?: string;
  relatedCleaningBookingId?: string;
}

/**
 * Credits a wallet and writes the matching ledger row atomically. `amount`
 * is always positive regardless of direction — `type` is what makes this a
 * credit (this function) vs a debit (debitWallet below).
 */
export async function creditWallet(
  accountProfileId: string,
  amount: number,
  type: WalletTransactionType,
  description: string,
  refs: WalletLedgerRefs = {}
) {
  if (amount <= 0) throw new ApiError(400, "Wallet credit amount must be greater than zero.");

  return prisma.$transaction(async (tx) => {
    const profile = await tx.accountProfile.update({
      where: { id: accountProfileId },
      data: { walletBalance: { increment: amount } },
    });

    const entry = await tx.walletTransaction.create({
      data: {
        accountProfileId,
        type,
        amount,
        balanceAfter: profile.walletBalance,
        description,
        ...refs,
      },
    });

    return { profile, entry };
  });
}

/**
 * Debits a wallet, throwing ApiError(409) if the balance is insufficient —
 * callers run this inside their own flow (e.g. withdrawal creation) and
 * should treat the throw as "stop, don't proceed" rather than catching and
 * continuing.
 */
export async function debitWallet(
  accountProfileId: string,
  amount: number,
  type: WalletTransactionType,
  description: string,
  refs: WalletLedgerRefs = {}
) {
  if (amount <= 0) throw new ApiError(400, "Wallet debit amount must be greater than zero.");

  return prisma.$transaction(async (tx) => {
    const current = await tx.accountProfile.findUnique({ where: { id: accountProfileId } });
    if (!current) throw new ApiError(404, "Account not found.");
    if (current.walletBalance < amount) {
      throw new ApiError(409, "Insufficient wallet balance.");
    }

    const profile = await tx.accountProfile.update({
      where: { id: accountProfileId },
      data: { walletBalance: { decrement: amount } },
    });

    const entry = await tx.walletTransaction.create({
      data: {
        accountProfileId,
        type,
        amount,
        balanceAfter: profile.walletBalance,
        description,
        ...refs,
      },
    });

    return { profile, entry };
  });
}
