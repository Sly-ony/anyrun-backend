import type { OrderSourceType } from "@prisma/client";
import prisma from "./prisma";

// Env vars are the fallback default for any source type with no explicit
// override in the CommissionRate collection. They're what a fresh
// environment runs on before a SUPER_ADMIN ever sets anything via
// PATCH /api/admin/commission-rates/{sourceType} — see docs/ADMIN_API.md.
// Still placeholders, not confirmed business figures.
const ENV_DEFAULT_RATES: Record<OrderSourceType, number> = {
  ERRAND: numFromEnv("COMMISSION_RATE_ERRAND", 0.15),
  RFQ_QUOTATION: numFromEnv("COMMISSION_RATE_RFQ", 0.1),
  CATALOG_PURCHASE: numFromEnv("COMMISSION_RATE_CATALOG", 0.1),
  CLEANING_BOOKING: numFromEnv("COMMISSION_RATE_CLEANING", 0.2),
};

function numFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getEnvDefaultRate(sourceType: OrderSourceType): number {
  return ENV_DEFAULT_RATES[sourceType];
}

/** DB override if a SUPER_ADMIN has set one for this source type, else the env default. */
export async function getCommissionRate(sourceType: OrderSourceType): Promise<number> {
  const override = await prisma.commissionRate.findUnique({ where: { sourceType } });
  return override?.rate ?? ENV_DEFAULT_RATES[sourceType];
}

/** Commission is taken on the gross amount; delivery fees never factor in here. */
export async function calculateCommission(amount: number, sourceType: OrderSourceType) {
  const rate = await getCommissionRate(sourceType);
  const commissionAmount = Math.round(amount * rate * 100) / 100;
  const payoutAmount = Math.round((amount - commissionAmount) * 100) / 100;
  return { rate, commissionAmount, payoutAmount };
}
