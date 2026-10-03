import prisma from "./prisma";
import { mockPaymentProvider } from "./paymentProvider";
import { ApiError } from "./apiError";

export async function chargeDeliveryJob(deliveryJobId: string, payerId: string, payeeId: string) {
  const job = await prisma.deliveryJob.findUnique({ where: { id: deliveryJobId } });
  if (!job) throw new ApiError(404, "Delivery job not found.");

  const existingPayment = await prisma.payment
    .findUnique({ where: { deliveryJobId: job.id } })
    .catch(() => null);
  if (existingPayment) {
    throw new ApiError(409, "This delivery job has already been charged.");
  }

  const chargeResult = await mockPaymentProvider.charge({
    amount: job.deliveryFee,
    payerId,
    payeeId,
    description: `Delivery fee for job ${job.id}`,
  });

  const finalStatus = chargeResult.success ? "PAID" : "FAILED";

  const payment = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        sourceType: "DELIVERY_JOB",
        deliveryJobId: job.id,
        amount: job.deliveryFee,
        deliveryFee: job.deliveryFee,
        status: finalStatus,
        provider: "mock",
        providerRef: chargeResult.providerRef,
        paidAt: chargeResult.success ? new Date() : null,
      },
    });

    // No commission on delivery fees — the full amount is the assignee's
    // wallet credit, same atomicity rationale as orderService.ts.
    if (chargeResult.success) {
      const payeeProfile = await tx.accountProfile.update({
        where: { id: payeeId },
        data: { walletBalance: { increment: job.deliveryFee } },
      });
      await tx.walletTransaction.create({
        data: {
          accountProfileId: payeeId,
          type: "EARNING",
          amount: job.deliveryFee,
          balanceAfter: payeeProfile.walletBalance,
          description: `Delivery fee for job ${job.id}`,
          relatedDeliveryJobId: job.id,
        },
      });
    }

    return payment;
  });

  if (!chargeResult.success) {
    throw new ApiError(402, "Delivery fee payment failed.");
  }

  return { job, payment };
}
