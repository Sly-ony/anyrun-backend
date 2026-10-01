import prisma from "./prisma";
import { anyStateMatch } from "./region";
import { RUNNER_ROLE, SUPPLIER_ROLE } from "./roles";
import type { ErrandRequest, RFQ, Quotation, OrderTx, DeliveryJob, CleaningBooking } from "@prisma/client";

// Every function here is fire-and-forget from the caller's point of view —
// a notification failure should never fail the request that triggered it,
// so callers wrap these in a try/catch that only logs.

export async function notifyNewErrandRequest(errand: ErrandRequest): Promise<void> {
  const runners = await prisma.accountProfile.findMany({
    where: {
      roles: { has: RUNNER_ROLE },
      isActive: true,
      ...anyStateMatch("serviceRegions", [errand.location]),
    },
    select: { id: true },
  });
  if (runners.length === 0) return;

  await prisma.notification.createMany({
    data: runners.map((r) => ({
      recipientId: r.id,
      type: "NEW_ERRAND_REQUEST" as const,
      title: "New errand near you",
      message: `A new "${errand.category}" errand was posted in ${errand.location.city}, ${errand.location.state}.`,
      relatedErrandId: errand.id,
    })),
  });
}

export async function notifyNewRfq(rfq: RFQ): Promise<void> {
  const suppliers = await prisma.accountProfile.findMany({
    where: {
      roles: { has: SUPPLIER_ROLE },
      isActive: true,
      ...anyStateMatch("serviceRegions", [rfq.region]),
    },
    select: { id: true },
  });
  if (suppliers.length === 0) return;

  await prisma.notification.createMany({
    data: suppliers.map((s) => ({
      recipientId: s.id,
      type: "NEW_RFQ" as const,
      title: "New RFQ near you",
      message: `A new RFQ${rfq.title ? ` — "${rfq.title}"` : ""} was posted in ${rfq.region.city}, ${rfq.region.state}.`,
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
