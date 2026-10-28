import type { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { ApiError } from "./apiError";
import { mockPaymentProvider } from "./paymentProvider";
import { calculateCommission } from "./commission";

type Tx = Prisma.TransactionClient;
const round = (n: number) => Math.round(n * 100) / 100;

interface FundableErrand {
  id: string;
  customerId: string;
  runnerId: string | null;
  agreedPrice: number | null;
}

/**
 * Charges the customer for the agreed price and records the money as HELD.
 * Nothing reaches the provider until the job is completed (releaseEscrow).
 * A failed charge records nothing, so the customer can simply try again.
 */
export async function fundErrand(errand: FundableErrand) {
  if (!errand.runnerId) throw new ApiError(409, "This job has no provider yet.");
  if (errand.agreedPrice == null || errand.agreedPrice <= 0) {
    throw new ApiError(409, "This job has no agreed price to pay.");
  }
  const amount = errand.agreedPrice;

  const existing = await prisma.orderTx.findUnique({ where: { sourceErrandId: errand.id } });
  if (existing) throw new ApiError(409, "This job has already been paid for.");

  const charge = await mockPaymentProvider.charge({
    amount,
    payerId: errand.customerId,
    payeeId: errand.runnerId,
    description: `Funds held for job ${errand.id}`,
  });
  if (!charge.success) {
    throw new ApiError(402, charge.failureReason ?? "Payment failed. Nothing was taken.");
  }

  const { rate, commissionAmount } = await calculateCommission(amount, "ERRAND");

  return prisma.$transaction(async (tx) => {
    const order = await tx.orderTx.create({
      data: {
        sourceType: "ERRAND",
        sourceErrandId: errand.id,
        amount,
        commissionRate: rate,
        commissionAmount,
        payerId: errand.customerId,
        payeeId: errand.runnerId!,
        paymentStatus: "PAID",
        escrowStatus: "HELD",
      },
    });
    const payment = await tx.payment.create({
      data: {
        sourceType: "ORDER",
        orderId: order.id,
        amount,
        commissionAmount,
        status: "PAID",
        provider: "mock",
        providerRef: charge.providerRef,
        paidAt: new Date(),
      },
    });
    await tx.notification.create({
      data: {
        recipientId: errand.runnerId!,
        type: "GENERAL",
        title: "Job funded",
        message: "The customer has paid and the money is held safely. You can start work.",
        relatedErrandId: errand.id,
      },
    });
    return { order, payment };
  });
}

/**
 * Pays the held money to the provider's wallet, minus commission.
 * `providerShare` (gross) pays only part of it to the provider and returns the
 * rest to the customer; omit it to pay the full amount.
 * Returns null when the job has no held money (old-style jobs).
 */
export async function releaseEscrow(tx: Tx, errandId: string, providerShare?: number) {
  const order = await tx.orderTx.findUnique({ where: { sourceErrandId: errandId } });
  if (!order || order.escrowStatus !== "HELD") return null;

  const share = providerShare ?? order.amount;
  if (share <= 0 || share > order.amount) {
    throw new ApiError(400, "The provider's share must be more than 0 and no more than the job price.");
  }
  const commission = round(share * order.commissionRate);
  const net = round(share - commission);
  const refund = round(order.amount - share);

  await tx.orderTx.update({
    where: { id: order.id },
    data: { escrowStatus: "RELEASED", commissionAmount: commission, refundedAmount: refund },
  });
  await tx.payment.updateMany({ where: { orderId: order.id }, data: { commissionAmount: commission } });

  const provider = await tx.accountProfile.update({
    where: { id: order.payeeId },
    data: { walletBalance: { increment: net } },
  });
  await tx.walletTransaction.create({
    data: {
      accountProfileId: order.payeeId,
      type: "EARNING",
      amount: net,
      balanceAfter: provider.walletBalance,
      description: `Payment for job ${errandId}`,
      relatedOrderId: order.id,
    },
  });
  await tx.notification.create({
    data: {
      recipientId: order.payeeId,
      type: "ORDER_PAID",
      title: "Payment released",
      message: `£${net.toFixed(2)} has been added to your wallet (platform commission already deducted).`,
      relatedErrandId: errandId,
    },
  });
  if (refund > 0) {
    await tx.notification.create({
      data: {
        recipientId: order.payerId,
        type: "GENERAL",
        title: "Part of your payment was returned",
        message: `£${refund.toFixed(2)} of your payment was returned after review.`,
        relatedErrandId: errandId,
      },
    });
  }
  return { net, commission, refund };
}

/** Returns all the held money to the customer. Null when nothing is held. */
export async function refundEscrow(tx: Tx, errandId: string) {
  const order = await tx.orderTx.findUnique({ where: { sourceErrandId: errandId } });
  if (!order || order.escrowStatus !== "HELD") return null;

  await tx.orderTx.update({
    where: { id: order.id },
    data: {
      escrowStatus: "REFUNDED",
      paymentStatus: "REFUNDED",
      refundedAmount: order.amount,
      commissionAmount: 0,
    },
  });
  await tx.payment.updateMany({
    where: { orderId: order.id },
    data: { status: "REFUNDED", commissionAmount: 0 },
  });
  await tx.notification.create({
    data: {
      recipientId: order.payerId,
      type: "GENERAL",
      title: "Payment refunded",
      message: `£${order.amount.toFixed(2)} has been returned to you.`,
      relatedErrandId: errandId,
    },
  });
  return { refunded: order.amount };
}