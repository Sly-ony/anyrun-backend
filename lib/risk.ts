import prisma from "./prisma";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

// Thresholds: change them here.
const HIGH_DISPUTES_AGAINST = 3;
const MEDIUM_DISPUTES_AGAINST = 2;
const MIN_CLOSED_JOBS = 5;
const HIGH_CANCEL_RATE = 0.4;
const MEDIUM_CANCEL_RATE = 0.25;

export async function getRiskStats(profileId: string) {
  const involved = { OR: [{ customerId: profileId }, { runnerId: profileId }] };
  const [closedJobs, cancelledByThem, disputesAgainst, disputesRaised] = await Promise.all([
    prisma.errandRequest.count({ where: { status: { in: ["COMPLETED", "CANCELLED"] }, ...involved } }),
    prisma.errandEvent.count({ where: { actorId: profileId, toStatus: "CANCELLED" } }),
    prisma.dispute.count({ where: { againstId: profileId } }),
    prisma.dispute.count({ where: { raisedById: profileId } }),
  ]);

  const cancelRate = closedJobs > 0 ? Math.min(1, cancelledByThem / closedJobs) : 0;
  const enoughJobs = closedJobs >= MIN_CLOSED_JOBS;
  const reasons: string[] = [];
  let level: RiskLevel = "LOW";

  if (disputesAgainst >= HIGH_DISPUTES_AGAINST) {
    level = "HIGH";
    reasons.push(`${disputesAgainst} disputes raised against this account`);
  } else if (disputesAgainst >= MEDIUM_DISPUTES_AGAINST) {
    level = "MEDIUM";
    reasons.push(`${disputesAgainst} disputes raised against this account`);
  }
  if (enoughJobs && cancelRate >= HIGH_CANCEL_RATE) {
    level = "HIGH";
    reasons.push(`Cancelled ${Math.round(cancelRate * 100)}% of its ${closedJobs} finished jobs`);
  } else if (enoughJobs && cancelRate >= MEDIUM_CANCEL_RATE) {
    if (level === "LOW") level = "MEDIUM";
    reasons.push(`Cancelled ${Math.round(cancelRate * 100)}% of its ${closedJobs} finished jobs`);
  }

  return {
    level,
    reasons,
    closedJobs,
    cancelledByThem,
    cancelRate: Math.round(cancelRate * 100) / 100,
    disputesAgainst,
    disputesRaised,
  };
}