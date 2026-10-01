import prisma from "./prisma";
import { ApiError } from "./apiError";
import type { DeliveryJob } from "@prisma/client";

export async function resolveDeliveryRequesterId(job: DeliveryJob): Promise<string> {
  if (job.errandRequestId) {
    const errand = await prisma.errandRequest.findUnique({ where: { id: job.errandRequestId } });
    if (!errand) throw new ApiError(404, "Linked errand request not found.");
    return errand.customerId;
  }
  if (job.relatedOrderId) {
    const order = await prisma.orderTx.findUnique({ where: { id: job.relatedOrderId } });
    if (!order) throw new ApiError(404, "Linked order not found.");
    return order.payerId;
  }
  throw new ApiError(500, "Delivery job has no linked errand or order.");
}
