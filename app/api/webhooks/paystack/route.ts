import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { paystackAdapter } from "@/lib/payments/paystack";
import { completeDeposit } from "@/lib/depositService";
import { resolveWithdrawal } from "@/lib/withdrawalService";

interface PaystackEvent {
  event: string;
  data: {
    reference: string;
    amount: number; // kobo/subunit
    currency: string;
    status: string;
    reason?: string;
  };
}

// Configure this exact URL in your Paystack dashboard's webhook settings.
// Must read the raw body for signature verification — do NOT parse it with
// request.json() before calling verifyWebhookSignature.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  const verification = paystackAdapter.verifyWebhookSignature(rawBody, signature);

  if (!verification.valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = verification.event as PaystackEvent;

  try {
    if (event.event === "charge.success") {
      const deposit = await prisma.deposit.findUnique({ where: { reference: event.data.reference } });
      if (deposit) {
        await completeDeposit(deposit.id, {
          success: true,
          amount: event.data.amount / 100,
          providerReference: event.data.reference,
        });
      }
    } else if (event.event === "transfer.success") {
      const withdrawal = await prisma.withdrawal.findUnique({ where: { reference: event.data.reference } });
      if (withdrawal) await resolveWithdrawal(withdrawal.id, { success: true });
    } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
      const withdrawal = await prisma.withdrawal.findUnique({ where: { reference: event.data.reference } });
      if (withdrawal) {
        await resolveWithdrawal(withdrawal.id, {
          success: false,
          reason: event.data.reason ?? `Paystack reported ${event.event}.`,
        });
      }
    }
    // Any other event type is ignored, not an error.
  } catch (err) {
    // Log and still return 200 — returning an error status makes Paystack
    // retry the same webhook repeatedly, which won't help if the failure is
    // a code bug rather than a transient issue. Manual reconciliation via
    // GET /api/admin/deposits /withdrawals is the fallback.
    console.error("Error processing Paystack webhook:", err);
  }

  return NextResponse.json({ received: true });
}
