import prisma from "./prisma";
import { matchesAnyState } from "./region";
import { asLocation, asLocationArray } from "./json";
import { RUNNER_ROLE, SUPPLIER_ROLE } from "./roles";
import type { ErrandRequest, RFQ, Quotation, OrderTx, DeliveryJob, CleaningBooking } from "@prisma/client";

// Every function here is fire-and-forget from the caller's point of view —
// a notification failure should never fail the request that triggered it,
// so callers wrap these in a try/catch that only logs.

export async function notifyNewErrandRequest(errand: ErrandRequest): Promise<void> {
  const location = asLocation(errand.location);

  // Fetch by role/active only — serviceRegions is a Json array, which
  // Postgres/Prisma can't filter at the DB level for "does any element
  // match this state" (see lib/region.ts) — so the state match happens
  // in-memory below instead.
  const candidates = await prisma.accountProfile.findMany({
    where: { roles: { has: RUNNER_ROLE }, isActive: true },
    select: { id: true, serviceRegions: true },
  });
  const runners = candidates.filter((c) => matchesAnyState(asLocationArray(c.serviceRegions), [location.state]));
  if (runners.length === 0) return;

  await prisma.notification.createMany({
    data: runners.map((r) => ({
      recipientId: r.id,
      type: "NEW_ERRAND_REQUEST" as const,
      title: "New errand near you",
      message: `A new "${errand.category}" errand was posted in ${location.city}, ${location.state}.`,
      relatedErrandId: errand.id,
    })),
  });
}

export async function notifyNewRfq(rfq: RFQ): Promise<void> {
  const region = asLocation(rfq.region);

  const candidates = await prisma.accountProfile.findMany({
    where: { roles: { has: SUPPLIER_ROLE }, isActive: true },
    select: { id: true, serviceRegions: true },
  });
  const suppliers = candidates.filter((c) => matchesAnyState(asLocationArray(c.serviceRegions), [region.state]));
  if (suppliers.length === 0) return;

  await prisma.notification.createMany({
    data: suppliers.map((s) => ({
      recipientId: s.id,
      type: "NEW_RFQ" as const,
      title: "New RFQ near you",
      message: `A new RFQ${rfq.title ? ` — "${rfq.title}"` : ""} was posted in ${region.city}, ${region.state}.`,
      relatedRFQId: rfq.id,
    })),
  });
}

export async function notifyQuotationReceived(rfq: RFQ, quotation: Quotation): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId: rfq.buyerId,
      type: "QUOTATION_RECEIVED",
      title: "New quotation received",
      message: `You received a new quotation on your RFQ${rfq.title ? ` "${rfq.title}"` : ""}.`,
      relatedRFQId: rfq.id,
    },
  });
}

export async function notifyQuotationAwarded(
  winners: Quotation[],
  losers: Quotation[]
): Promise<void> {
  const data = [
    ...winners.map((q) => ({
      recipientId: q.supplierId,
      type: "QUOTATION_ACCEPTED" as const,
      title: "Your quotation was accepted",
      message: "Congratulations — your quotation was accepted. Payment will follow.",
      relatedRFQId: q.rfqId,
    })),
    ...losers.map((q) => ({
      recipientId: q.supplierId,
      type: "GENERAL" as const,
      title: "RFQ update",
      message: "Your quotation on this RFQ was not selected this time.",
      relatedRFQId: q.rfqId,
    })),
  ];
  if (data.length === 0) return;
  await prisma.notification.createMany({ data });
}

export async function notifyOrderPaid(order: OrderTx): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId: order.payeeId,
      type: "ORDER_PAID",
      title: "Payment received",
      message: `A payment of ${order.amount} has been made to you (platform commission already deducted).`,
    },
  });
}

export async function notifyDeliveryUpdate(
  job: DeliveryJob,
  recipientId: string,
  message: string
): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId,
      type: "DELIVERY_UPDATE",
      title: "Delivery update",
      message,
    },
  });
}

export async function notifyCleaningBookingUpdate(
  booking: CleaningBooking,
  recipientId: string,
  message: string
): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId,
      type: "CLEANING_BOOKING_UPDATE",
      title: "Cleaning booking update",
      message,
    },
  });
}

export async function notifyAccountSuspended(accountProfileId: string, reason: string): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId: accountProfileId,
      type: "ACCOUNT_SUSPENDED",
      title: "Your account has been suspended",
      message: reason,
    },
  });
}

export async function notifyDisputeUpdate(
  recipientId: string,
  message: string
): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId,
      type: "DISPUTE_UPDATE",
      title: "Dispute update",
      message,
    },
  });
}

export async function notifyDepositUpdate(
  accountProfileId: string,
  success: boolean,
  amount: number
): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId: accountProfileId,
      type: "DEPOSIT_UPDATE",
      title: success ? "Deposit successful" : "Deposit failed",
      message: success
        ? `Your deposit of ${amount} has been added to your wallet.`
        : `Your deposit of ${amount} could not be completed. No funds were taken.`,
    },
  });
}

export async function notifyWithdrawalUpdate(
  accountProfileId: string,
  status: "PROCESSING" | "COMPLETED" | "FAILED",
  amount: number
): Promise<void> {
  const titles: Record<typeof status, string> = {
    PROCESSING: "Withdrawal processing",
    COMPLETED: "Withdrawal completed",
    FAILED: "Withdrawal failed",
  };
  const messages: Record<typeof status, string> = {
    PROCESSING: `Your withdrawal of ${amount} has been sent to your payment provider for processing.`,
    COMPLETED: `Your withdrawal of ${amount} has been paid out.`,
    FAILED: `Your withdrawal of ${amount} failed and has been returned to your wallet balance.`,
  };
  await prisma.notification.create({
    data: {
      recipientId: accountProfileId,
      type: "WITHDRAWAL_UPDATE",
      title: titles[status],
      message: messages[status],
    },
  });
}

export async function notifyVerificationReviewed(
  accountProfileId: string,
  approved: boolean,
  label: string
): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientId: accountProfileId,
      type: "VERIFICATION_UPDATE",
      title: approved ? "Verification approved" : "Verification rejected",
      message: approved
        ? `Your ${label} verification has been approved.`
        : `Your ${label} verification was rejected. You can resubmit with updated documents.`,
    },
  });
}
