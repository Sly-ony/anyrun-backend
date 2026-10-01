import { randomUUID } from "crypto";

export interface ChargeParams {
  amount: number;
  currency?: string;
  payerId: string;
  payeeId: string;
  description: string;
}

export interface ChargeResult {
  success: boolean;
  providerRef: string;
  failureReason?: string;
}

/**
 * Mock provider — swap this module's implementation for a real gateway SDK
 * call when one is integrated. Every call site depends only on this
 * interface, so that's the only file that needs to change.
 */
export const mockPaymentProvider = {
  async charge(params: ChargeParams): Promise<ChargeResult> {
    // Simulate network latency so calling code that awaits this behaves the
    // same way it will against a real gateway.
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      success: true,
      providerRef: `mock_${randomUUID()}`,
    };
  },
};
