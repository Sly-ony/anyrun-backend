// Cleaning (domestic or commercial) is never something a regular supplier
// can list — it's exclusively fulfilled through CleaningBooking against the
// one seeded CLEANING_PROVIDER account. Suppliers picking their own category
// text means this has to be a normalized substring check, not an enum.
const RESERVED_CATEGORY_KEYWORDS = ["cleaning", "cleaner", "housekeeping"];

export function isReservedCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return RESERVED_CATEGORY_KEYWORDS.some((kw) => normalized.includes(kw));
}
