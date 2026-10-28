import prisma from "./prisma";
import { ApiError } from "./apiError";

/** True when the errand has a dispute that is still being reviewed. */
export async function findOpenErrandDispute(errandId: string) {
  return prisma.dispute.findFirst({
    where: { relatedType: "ERRAND", relatedId: errandId, status: { in: ["OPEN", "IN_REVIEW"] } },
    select: { id: true, status: true },
  });
}

/** Freezes status changes and payment while a dispute is open. */
export async function assertNoOpenErrandDispute(errandId: string) {
  if (await findOpenErrandDispute(errandId)) {
    throw new ApiError(
      409,
      "This job is under dispute. Our team is reviewing it, so its status and payment are paused."
    );
  }
}