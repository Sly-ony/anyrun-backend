import type { PaymentGateway } from "@prisma/client";
import type { PaymentGatewayAdapter } from "./types";
import { paystackAdapter } from "./paystack";
import { flutterwaveAdapter } from "./flutterwave";

export function getGatewayAdapter(provider: PaymentGateway): PaymentGatewayAdapter {
  switch (provider) {
    case "PAYSTACK":
      return paystackAdapter;
    case "FLUTTERWAVE":
      return flutterwaveAdapter;
  }
}

export * from "./types";
