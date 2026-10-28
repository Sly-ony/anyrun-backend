import prisma from "./prisma";
import { ApiError } from "./apiError";

const NEW_ACCOUNT_DAYS = 7;

/** Maximum job price (GBP) for a new or unverified provider. Set NEW_ACCOUNT_JOB_LIMIT to change it. */
export function newAccountLimit(): number {
  const raw = parseFloat(process.env.NEW_ACCOUNT_JOB_LIMIT ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : 100;
}

/**
 * A provider that is less than 7 days old, or has no approved verification,
 * can only agree jobs up to the limit. Protects customers from brand-new
 * accounts taking large payments.
 */
export async function assertWithinNewAccountLimit(providerId: string, amount: number) {
  const limit = newAccountLimit();
  if (amount <= limit) return;

  const p = await prisma.accountProfile.findUnique({
    where: { id: providerId },
    select: { createdAt: true, canProvideServices: true },
  });
  if (!p) return;

  const isNew = Date.now() - p.createdAt.getTime() < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
  let verified = p.canProvideServices;
  if (!verified) {
    const approved = await prisma.verification.findFirst({
      where: { accountProfileId: providerId, status: "APPROVED" },
      select: { id: true },
    });
    verified = !!approved;
  }

  if (isNew || !verified) {
    throw new ApiError(
      409,
      `Jobs for new or unverified accounts are limited to £${limit.toFixed(2)} for now. Propose a lower price, or the provider can complete verification to lift the limit.`
    );
  }
}