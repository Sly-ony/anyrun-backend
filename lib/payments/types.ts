export interface InitializePaymentParams {
  email: string;
  amount: number; // major currency unit, e.g. 25.50 for £25.50 — each adapter converts to whatever the gateway's API expects
  currency: string;
  reference: string; // our internal, globally-unique Deposit.reference
  callbackUrl: string; // where the gateway redirects the browser after checkout
}

export interface InitializePaymentResult {
  checkoutUrl: string;
  providerReference: string; // the gateway's own identifier for this attempt, if it gives one up front
}

export interface VerifyPaymentResult {
  success: boolean;
  amount: number; // major currency unit, as confirmed by the gateway
  currency: string;
  providerReference: string;
  raw: unknown; // the gateway's full verify response, kept for audit/debugging
}

export interface InitiateTransferParams {
  amount: number;
  currency: string;
  reference: string; // our internal, globally-unique Withdrawal.reference
  reason: string;
  recipient: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    providerRecipientCode?: string; // reused if the PayoutMethod already registered one
  };
}

export interface InitiateTransferResult {
  success: boolean;
  providerTransferId: string;
  providerRecipientCode?: string; // returned so the caller can cache it on the PayoutMethod if it was just created
  failureReason?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  event: unknown; // the parsed webhook body, if signature verification passed
}

export interface PaymentGatewayAdapter {
  initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  createTransferRecipient(recipient: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    currency: string;
  }): Promise<{ providerRecipientCode: string }>;
  initiateTransfer(params: InitiateTransferParams): Promise<InitiateTransferResult>;
  /** rawBody must be the exact, unparsed request body text — signatures are computed over raw bytes. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): WebhookVerificationResult;
}
