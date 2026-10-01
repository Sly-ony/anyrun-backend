import type { RegionLike } from "./validation/shared";

/**
 * Builds a Prisma `OR` filter that matches a composite `Location` field
 * against ANY of the given regions (by state + city — we deliberately don't
 * match on `area` or coordinates, which are too granular for "is this runner
 * in scope for this request" matching).
 *
 * Usage:
 *   const clauses = [{ status: "OPEN" }];
 *   if (regions.length) clauses.push(anyRegionMatch("location", regions));
 *   const where = { AND: clauses };
 */
export function anyRegionMatch(field: string, regions: RegionLike[]) {
  return {
    OR: regions.map((r) => ({
      [field]: { is: { state: r.state, city: r.city } },
    })),
  };
}

/**
 * State-only match, deliberately coarser than anyRegionMatch. Used for
 * notification fan-out: a runner/supplier registered anywhere in a state
 * should hear about a new opportunity anywhere in that state, even if the
 * city spelling/subdivision doesn't line up exactly. Browse/search stays on
 * the tighter state+city match above.
 *
 * "State" here means whatever a country's top-level administrative region
 * is called in the Location.state field — e.g. a county or region in the UK
 * (this business's home market), Edo State in Nigeria, etc. Not every
 * country calls it a "state", but the field is used the same way regardless
 * of the term a given country uses.
 */
export function anyStateMatch(field: string, regions: RegionLike[]) {
  const states = Array.from(new Set(regions.map((r) => r.state)));
  return { [field]: { is: { state: { in: states } } } };
}
