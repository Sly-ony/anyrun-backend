import type { LocationInput, AddressInput, VerificationDocumentInput } from "./validation/shared";

/**
 * Prisma's MongoDB composite types gave us strongly-typed embedded objects;
 * Postgres Json columns are typed as `Prisma.JsonValue` (effectively
 * `unknown`) by Prisma Client. These helpers are the single place that
 * casts a Json column back to the shape we know it actually holds, written
 * by our own zod-validated routes. They do no runtime validation — this is
 * a type-level convenience, not a safety net. If the stored shape is ever
 * wrong, these will not catch it.
 */

export function asLocation(value: unknown): LocationInput {
  return value as LocationInput;
}

export function asLocationArray(value: unknown): LocationInput[] {
  return (value as LocationInput[] | null | undefined) ?? [];
}

export interface StoredRFQLineItem {
  itemId: string;
  name: string;
  quantity: number;
  notes?: string;
}

export function asRFQLineItems(value: unknown): StoredRFQLineItem[] {
  return (value as StoredRFQLineItem[] | null | undefined) ?? [];
}

export interface StoredQuotationLineItem {
  rfqItemId?: string;
  name: string;
  price: number;
  notes?: string;
  available: boolean;
}

export function asQuotationLineItems(value: unknown): StoredQuotationLineItem[] {
  return (value as StoredQuotationLineItem[] | null | undefined) ?? [];
}

export function asAddress(value: unknown): AddressInput {
  return value as AddressInput;
}

export function asVerificationDocuments(value: unknown): VerificationDocumentInput[] {
  return (value as VerificationDocumentInput[] | null | undefined) ?? [];
}
