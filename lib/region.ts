import type { Prisma } from "@prisma/client";
import type { RegionLike } from "./validation/shared";

/**
 * Converts a Json column holding an array of Location objects
 * (e.g. AccountProfile.serviceRegions) into a typed RegionLike[].
 * Prisma reads Json columns back as untyped JsonValue, so route code
 * must go through this before calling `.length` or `anyRegionMatch`.
 * Never throws: a null, non-array, or malformed value yields [] or
 * drops the bad entries.
 */
export function asRegions(value: Prisma.JsonValue | null | undefined): RegionLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is Prisma.JsonObject =>
      typeof r === "object" &&
      r !== null &&
      !Array.isArray(r) &&
      typeof r.state === "string" &&
      typeof r.city === "string"
  ) as unknown as RegionLike[];
}

/**
 * Builds a Prisma `OR` filter that matches a single-object Json `Location`
 * field (e.g. ErrandRequest.location, RFQ.region, CatalogItem.region)
 * against ANY of the given regions, by state + city. Uses Postgres/Prisma's
 * Json path filtering, which works here because the target field holds one
 * JSON object, not an array — see `matchesAnyState` below for why the
 * array case (AccountProfile.serviceRegions) needs a different approach.
 *
 * Usage:
 *   const clauses: Prisma.ErrandRequestWhereInput[] = [{ status: "OPEN" }];
 *   if (regions.length) clauses.push(anyRegionMatch("location", regions));
 *   const where = { AND: clauses };
 */
export function anyRegionMatch(field: string, regions: RegionLike[]) {
  return {
    OR: regions.map((r) => ({
      AND: [
        { [field]: { path: ["state"], equals: r.state } },
        { [field]: { path: ["city"], equals: r.city } },
      ],
    })),
  } as any; // computed key `[field]` widens the type; callers pass this into a typed where array
}

/**
 * In-memory check: does ANY entry in this account's serviceRegions array
 * (a Json array of Location objects) have a state in the given list?
 *
 * This used to be a DB-level filter under MongoDB, where composite-type
 * *lists* support a `some`-style match the same way relation lists do.
 * Postgres Json columns have no equivalent — Prisma's Json path filtering
 * extracts a path from a single JSON document, it doesn't iterate "does any
 * array element match". So region-matched notification fan-out now fetches
 * candidate accounts by role+isActive only (see lib/notificationService.ts)
 * and filters by this function in application code instead. Fine at the
 * scale this matters (number of active runners/suppliers, not number of
 * errands), but worth knowing if that scale assumption ever changes — at
 * that point this would want a proper join table instead of a Json array.
 *
 * "State" here means whatever a country calls its top-level administrative
 * region (a UK county/region, a Nigerian state, etc.) — the field name is
 * generic.
 */
export function matchesAnyState(accountRegions: RegionLike[], states: string[]): boolean {
  const stateSet = new Set(states);
  return accountRegions.some((r) => stateSet.has(r.state));
}