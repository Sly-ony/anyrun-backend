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
 * Flutterwave adapter, built against Flutterwave's public v3 REST API
 * (https://developer.flutterwave.com/docs). Verify field names against
 * current docs before going live.
 *
 * Flutterwave has broader multi-currency/corridor support than Paystack,
 * including some GBP payout corridors, but exact currency/country support
 * depends on what's enabled on your specific merchant account — confirm
 * with Flutterwave which payout corridors (GBP to UK banks, specifically)
 * are actually live for you before relying on this for real withdrawals.
 */

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

function getSecretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error("FLUTTERWAVE_SECRET_KEY environment variable is not set.");
  return key;
}

function getWebhookHash(): string {
  const hash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!hash) throw new Error("FLUTTERWAVE_WEBHOOK_HASH environment variable is not set.");
  return hash;
}

async function flutterwaveFetch(path: string, init: RequestInit) {
  const response = await fetch(`${FLUTTERWAVE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok || body.status === "error") {
    throw new Error(`Flutterwave API error (${path}): ${body.message ?? response.statusText}`);
  }
  return body;
}

export const flutterwaveAdapter: PaymentGatewayAdapter = {
  async initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const body = await flutterwaveFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: params.reference,
        amount: params.amount,
        currency: params.currency,
        redirect_url: params.callbackUrl,
        customer: { email: params.email },
        customizations: { title: "Anyrun Wallet Top-up" },
      }),
    });
    return {
      checkoutUrl: body.data.link,
      providerReference: params.reference, // Flutterwave's own numeric id is only known after payment; we verify by our tx_ref instead
    };
  },

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const body = await flutterwaveFetch(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { method: "GET" }
    );
    return {
      success: body.data.status === "successful",
      amount: body.data.amount,
      currency: body.data.currency,
      providerReference: String(body.data.id),
      raw: body.data,
    };
  },

  async createTransferRecipient(recipient) {
    // Flutterwave's /transfers endpoint can take bank details directly
    // without a separate recipient-creation step, but we still register a
    // beneficiary so PayoutMethod has a stable providerRecipientCode like
    // the Paystack adapter does, keeping the two interchangeable.
    const body = await flutterwaveFetch("/beneficiaries", {
      method: "POST",
      body: JSON.stringify({
        account_bank: recipient.bankCode,
        account_number: recipient.accountNumber,
        beneficiary_name: recipient.accountName,
        currency: recipient.currency,
      }),
    });
    return { providerRecipientCode: String(body.data.id) };
  },

  async initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult> {
    try {
      const body = await flutterwaveFetch("/transfers", {
        method: "POST",
        body: JSON.stringify({
          account_bank: params.recipient.bankCode,
          account_number: params.recipient.accountNumber,
          beneficiary_name: params.recipient.accountName,
          amount: params.amount,
          currency: params.currency,
          reference: params.reference,
          narration: params.reason,
        }),
      });
      return {
        success: true, // a 2xx here means the transfer was accepted for processing, not that it's settled — see the webhook flow
        providerTransferId: String(body.data.id),
      };
    } catch (err) {
      return {
        success: false,
        providerTransferId: "",
        failureReason: err instanceof Error ? err.message : "Unknown Flutterwave transfer error.",
      };
    }
  },

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): WebhookVerificationResult {
    // Flutterwave uses a simple shared-secret string comparison (the
    // "verif-hash" header must equal whatever hash you configured in your
    // Flutterwave dashboard), not an HMAC over the body like Paystack.
    if (!signatureHeader || signatureHeader !== getWebhookHash()) {
      return { valid: false, event: null };
    }
    try {
      return { valid: true, event: JSON.parse(rawBody) };
    } catch {
      return { valid: false, event: null };
    }
  },
};
