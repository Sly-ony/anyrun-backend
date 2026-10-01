import type { OrderSourceType } from "@prisma/client";
import prisma from "./prisma";
import { calculateCommission } from "./commission";
import { mockPaymentProvider } from "./paymentProvider";
import { ApiError } from "./apiError";
import { notifyOrderPaid } from "./notificationService";

export interface CreateOrderParams {
  sourceType: OrderSourceType;
  amount: number;
  payerId: string;
  payeeId: string;
  description: string;
  sourceErrandId?: string;
  sourceQuotationId?: string;
  sourceCatalogItemId?: string;
  sourceCleaningBookingId?: string;
}

/**
 * Creates the OrderTx, attempts a charge through the (mocked) payment
 * provider, and writes the resulting Payment ledger row. Order creation and
 * the charge attempt are two steps on purpose: an OrderTx can exist in
 * PENDING/FAILED state without ever having produced a "successful" payment,
 * which is what makes the money flow auditable.
 */
export async function createAndChargeOrder(params: CreateOrderParams) {
  if (params.payerId === params.payeeId) {
    throw new ApiError(400, "Payer and payee cannot be the same account.");
  }
  if (params.amount <= 0) {
    throw new ApiError(400, "Order amount must be greater than zero.");
  }

  const { rate, commissionAmount } = await calculateCommission(params.amount, params.sourceType);

  const order = await prisma.orderTx.create({
    data: {
      sourceType: params.sourceType,
      sourceErrandId: params.sourceErrandId,
      sourceQuotationId: params.sourceQuotationId,
      sourceCatalogItemId: params.sourceCatalogItemId,
      sourceCleaningBookingId: params.sourceCleaningBookingId,
      amount: params.amount,
      commissionRate: rate,
      commissionAmount,
      payerId: params.payerId,
      payeeId: params.payeeId,
      paymentStatus: "PENDING",
    },
  });

  const chargeResult = await mockPaymentProvider.charge({
    amount: params.amount,
    payerId: params.payerId,
    payeeId: params.payeeId,
    description: params.description,
  });

  const finalStatus = chargeResult.success ? "PAID" : "FAILED";

  const [updatedOrder, payment] = await prisma.$transaction([
    prisma.orderTx.update({
      where: { id: order.id },
      data: { paymentStatus: finalStatus },
    }),
    prisma.payment.create({
      data: {
        sourceType: "ORDER",
        orderId: order.id,
        amount: params.amount,
        commissionAmount,
        status: finalStatus,
        provider: "mock",
        providerRef: chargeResult.providerRef,
        paidAt: chargeResult.success ? new Date() : null,
      },
    }),
  ]);

  if (!chargeResult.success) {
    throw new ApiError(
      402,
      chargeResult.failureReason ?? "Payment failed. The order has been recorded as FAILED."
    );
  }

  try {
    await notifyOrderPaid(updatedOrder);
  } catch (e) {
    console.error("Failed to notify payee of successful payment:", e);
  }

  return { order: updatedOrder, payment };
}
