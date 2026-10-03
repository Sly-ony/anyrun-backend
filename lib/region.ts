import type { RegionLike } from "./validation/shared";

/**
 * Builds a Prisma `OR` filter that matches a single-object Json `Location`
 * field (e.g. ErrandRequest.location, RFQ.region, CatalogItem.region)
 * against ANY of the given regions, by state + city. Uses Postgres/Prisma's
 * Json path filtering, which works here because the target field holds one
 * JSON object, not an array — see `matchesAnyState` below for why the
 * array case (AccountProfile.serviceRegions) needs a different approach.
 *
 * Usage:
 *   const clauses = [{ status: "OPEN" }];
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
  };
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
