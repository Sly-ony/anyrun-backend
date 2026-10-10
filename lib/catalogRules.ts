import prisma from "./prisma";

// Cleaning (domestic or commercial) is never something a regular supplier
// can list — it's exclusively fulfilled through CleaningBooking against the
// one seeded CLEANING_PROVIDER account. Suppliers picking their own category
// text means this has to be a normalized substring check, not an enum.
//
// These are the fallback defaults, used whenever the ReservedCategoryKeyword
// table is empty — same pattern as lib/commission.ts's env-var defaults:
// nothing to seed before the first admin manages this list via
// /api/admin/reserved-categories.
const DEFAULT_RESERVED_KEYWORDS = ["cleaning", "cleaner", "housekeeping"];

export async function getReservedCategoryKeywords(): Promise<string[]> {
  const rows = await prisma.reservedCategoryKeyword.findMany();
  return rows.length > 0 ? rows.map((r) => r.keyword) : DEFAULT_RESERVED_KEYWORDS;
}

export async function isReservedCategory(category: string): Promise<boolean> {
  const normalized = category.trim().toLowerCase();
  const keywords = await getReservedCategoryKeywords();
  return keywords.some((kw) => normalized.includes(kw));
}
