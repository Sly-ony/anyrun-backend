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

  const payment = await prisma.payment.create({
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

  if (!chargeResult.success) {
    throw new ApiError(402, "Delivery fee payment failed.");
  }

  return { job, payment };
}
