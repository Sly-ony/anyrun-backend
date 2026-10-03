import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { flutterwaveAdapter } from "@/lib/payments/flutterwave";
import { completeDeposit } from "@/lib/depositService";
import { resolveWithdrawal } from "@/lib/withdrawalService";

interface FlutterwaveEvent {
  event: string;
  data: {
    tx_ref?: string; // present on charge events
    reference?: string; // present on transfer events
    id: number;
    amount: number;
    currency: string;
    status: string; // "successful" | "failed" for charges; "SUCCESSFUL" | "FAILED" for transfers
    complete_message?: string;
  };
}

// Configure this exact URL (plus the matching secret hash — see
// FLUTTERWAVE_WEBHOOK_HASH in .env.example) in your Flutterwave dashboard.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("verif-hash");
  const verification = flutterwaveAdapter.verifyWebhookSignature(rawBody, signature);

  if (!verification.valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = verification.event as FlutterwaveEvent;

  try {
    if (event.event === "charge.completed" && event.data.tx_ref) {
      const deposit = await prisma.deposit.findUnique({ where: { reference: event.data.tx_ref } });
      if (deposit) {
        const success = event.data.status === "successful";
        await completeDeposit(
          deposit.id,
          success
            ? { success: true, amount: event.data.amount, providerReference: String(event.data.id) }
            : { success: false, providerReference: String(event.data.id) }
        );
      }
    } else if (event.event === "transfer.completed" && event.data.reference) {
      const withdrawal = await prisma.withdrawal.findUnique({ where: { reference: event.data.reference } });
      if (withdrawal) {
        const success = event.data.status === "SUCCESSFUL";
        await resolveWithdrawal(
          withdrawal.id,
          success
            ? { success: true }
            : { success: false, reason: event.data.complete_message ?? "Flutterwave reported a failed transfer." }
        );
      }
    }
  } catch (err) {
    console.error("Error processing Flutterwave webhook:", err);
  }

  return NextResponse.json({ received: true });
}
