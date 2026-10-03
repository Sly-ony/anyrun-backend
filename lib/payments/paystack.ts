import { createHmac } from "crypto";
import type {
  PaymentGatewayAdapter,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
  InitiateTransferParams,
  InitiateTransferResult,
  WebhookVerificationResult,
} from "./types";

/**
 * Paystack adapter, built against Paystack's public REST API
 * (https://paystack.com/docs/api/). Verify field names against current docs
 * before going live — gateway APIs do change.
 *
 * !! IMPORTANT FOR THIS UK/GBP BUSINESS !!
 * Paystack's core markets are Nigeria, Ghana, South Africa, and Kenya; its
 * settlement currencies are NGN/GHS/ZAR/KES (plus USD for some merchants).
 * It does NOT support GBP settlement or UK bank payouts as of this writing.
 * The /transferrecipient `type: "nuban"` recipient format below is Nigeria-
 * specific (NUBAN = Nigerian Uniform Bank Account Number). If your Paystack
 * merchant account isn't NGN-denominated, deposits/withdrawals through this
 * adapter will fail outright. Confirm with Paystack support which currency
 * your account is actually approved for before wiring this up in production
 * — you may end up using Paystack only for NGN-paying customers/suppliers
 * and Flutterwave for everyone else, rather than offering both everywhere.
 */

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY environment variable is not set.");
  return key;
}

async function paystackFetch(path: string, init: RequestInit) {
  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok || body.status === false) {
    throw new Error(`Paystack API error (${path}): ${body.message ?? response.statusText}`);
  }
  return body;
}

export const paystackAdapter: PaymentGatewayAdapter = {
  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const body = await paystackFetch("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amount * 100), // Paystack expects the subunit (kobo for NGN)
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
      }),
    });
    return {
      checkoutUrl: body.data.authorization_url,
      providerReference: body.data.reference,
    };
  },

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const body = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
    });
    return {
      success: body.data.status === "success",
      amount: body.data.amount / 100,
      currency: body.data.currency,
      providerReference: body.data.reference,
      raw: body.data,
    };
  },

  async createTransferRecipient(recipient) {
    const body = await paystackFetch("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "nuban", // Nigeria-specific — see the module-level caveat above
        name: recipient.accountName,
        account_number: recipient.accountNumber,
        bank_code: recipient.bankCode,
        currency: recipient.currency,
      }),
    });
    return { providerRecipientCode: body.data.recipient_code };
  },

  async initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult> {
    if (!params.recipient.providerRecipientCode) {
      throw new Error("Paystack transfers require a providerRecipientCode — create one first.");
    }
    try {
      const body = await paystackFetch("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: Math.round(params.amount * 100),
          recipient: params.recipient.providerRecipientCode,
          reason: params.reason,
          reference: params.reference,
        }),
      });
      return {
        success: body.data.status === "success" || body.data.status === "pending",
        providerTransferId: body.data.transfer_code,
      };
    } catch (err) {
      return {
        success: false,
        providerTransferId: "",
        failureReason: err instanceof Error ? err.message : "Unknown Paystack transfer error.",
      };
    }
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): WebhookVerificationResult {
    if (!signatureHeader) return { valid: false, event: null };
    const expected = createHmac("sha512", getSecretKey()).update(rawBody).digest("hex");
    if (expected !== signatureHeader) return { valid: false, event: null };
    try {
      return { valid: true, event: JSON.parse(rawBody) };
    } catch {
      return { valid: false, event: null };
    }
  },
};
