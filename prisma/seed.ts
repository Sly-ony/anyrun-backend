/**
 * Seeds three independent things:
 *
 * 1. The one reserved CLEANING_PROVIDER account — the founder's own facility
 *    management / cleaning company (can't be created through the normal
 *    sign-up API — that's the point of it being reserved).
 * 2. (Optional) the first SUPER_ADMIN account — there is no self-service way
 *    to become an admin, so someone has to be bootstrapped directly in the
 *    database. Once it exists, that super admin grants EDITOR/SUPPORT/
 *    DEVELOPER roles to other accounts via POST /api/admin/admins — see
 *    docs/ADMIN_API.md.
 * 3. A starter JobCategory list — so there's something to select from at
 *    sign-up without hand-entering categories one at a time via
 *    POST /api/admin/job-categories. Idempotent (upsert by name), safe to
 *    re-run.
 *
 * Run with: npx prisma db seed
 *
 * Configure via env vars before running:
 *   CLEANING_PROVIDER_EMAIL      (required)
 *   CLEANING_PROVIDER_PASSWORD   (required — a real password, not a placeholder)
 *   CLEANING_PROVIDER_NAME       (default: "Anyrun Cleaning Services")
 *   CLEANING_PROVIDER_PHONE      (optional)
 *   CLEANING_PROVIDER_ADDRESS_* (see seedCleaningProvider below — all optional, sensible UK placeholder defaults)
 *   ADMIN_EMAIL                  (optional — skips admin seeding if unset)
 *   ADMIN_PASSWORD               (required if ADMIN_EMAIL is set)
 *   ADMIN_NAME                   (default: "Platform Admin")
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// Seeding always runs against the direct connection, never the pgbouncer
// pooled one — same reasoning as prisma.config.ts.
const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// A placeholder address so seeding doesn't fail now that AccountProfile.address
// is required — both seeded accounts should have their real address set
// afterward via PATCH /api/account.
function placeholderAddress() {
  return {
    addressLine1: process.env.CLEANING_PROVIDER_ADDRESS_LINE1 ?? "1 Example Street",
    city: process.env.CLEANING_PROVIDER_ADDRESS_CITY ?? "London",
    state: process.env.CLEANING_PROVIDER_ADDRESS_STATE ?? "Greater London",
    postalCode: process.env.CLEANING_PROVIDER_ADDRESS_POSTCODE ?? "SW1A 1AA",
    country: process.env.CLEANING_PROVIDER_ADDRESS_COUNTRY ?? "United Kingdom",
  };
}

async function seedCleaningProvider() {
  const email = process.env.CLEANING_PROVIDER_EMAIL;
  const password = process.env.CLEANING_PROVIDER_PASSWORD;
  const businessName = process.env.CLEANING_PROVIDER_NAME ?? "Anyrun Cleaning Services";
  const phone = process.env.CLEANING_PROVIDER_PHONE;

  if (!email || !password) {
    throw new Error(
      "CLEANING_PROVIDER_EMAIL and CLEANING_PROVIDER_PASSWORD must be set before seeding."
    );
  }

  const existingActive = await prisma.accountProfile.findMany({
    where: { roles: { has: "CLEANING_PROVIDER" }, isActive: true },
  });

  if (existingActive.length > 0) {
    console.log(
      `Skipping cleaning provider: an active one already exists (accountProfile id ${existingActive[0].id}).`
    );
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(
      `A user with email ${email} already exists but has no active CLEANING_PROVIDER profile — resolve manually rather than seeding blindly.`
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const address = placeholderAddress();

  const user = await prisma.user.create({
    data: { email, phone, passwordHash, name: businessName },
  });

  const profile = await prisma.accountProfile.create({
    data: {
      userId: user.id,
      roles: ["CLEANING_PROVIDER"],
      accountKind: "BUSINESS",
      address, // placeholder — update via PATCH /api/account
      businessName,
      businessAddress: address, // placeholder too
      isActive: true,
      jobCategoryIds: [],
      serviceRegions: [],
    },
  });

  console.log(`Created CLEANING_PROVIDER account: user ${user.id}, profile ${profile.id}`);
  console.log("  NOTE: seeded with a placeholder address — update it via PATCH /api/account.");
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.log("Skipping admin seed: ADMIN_EMAIL not set.");
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Platform Admin";
  if (!password) {
    throw new Error("ADMIN_PASSWORD must be set when ADMIN_EMAIL is provided.");
  }

  // Always SUPER_ADMIN, never a lesser role — see docs/ADMIN_API.md for why.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { accountProfile: true },
  });

  if (existingUser?.accountProfile) {
    if (existingUser.accountProfile.adminRole === "SUPER_ADMIN") {
      console.log(`Skipping admin: ${email} is already a super admin.`);
      return;
    }
    await prisma.accountProfile.update({
      where: { id: existingUser.accountProfile.id },
      data: { adminRole: "SUPER_ADMIN" },
    });
    console.log(`Promoted existing account ${email} to super admin.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  const profile = await prisma.accountProfile.create({
    data: {
      userId: user.id,
      roles: ["INDIVIDUAL_CUSTOMER"],
      accountKind: "INDIVIDUAL",
      address: placeholderAddress(), // placeholder — update via PATCH /api/account
      isActive: true,
      adminRole: "SUPER_ADMIN",
      jobCategoryIds: [],
      serviceRegions: [],
    },
  });

  console.log(`Created super admin account: user ${user.id}, profile ${profile.id}`);
  console.log("  NOTE: seeded with a placeholder address — update it via PATCH /api/account.");
}

// Starter categories. `requiresVerification: true` is a judgment call for
// anything touching safety, vulnerable people/property access, or
// specialist licensing — review and adjust before relying on this list as
// the final word; it's a reasonable starting point, not a legal opinion.
const STARTER_CATEGORIES: { name: string; description: string; requiresVerification: boolean }[] = [
  { name: "Cleaning", description: "Domestic and commercial cleaning.", requiresVerification: true },
  { name: "Electrician", description: "Electrical installation and repair work.", requiresVerification: true },
  { name: "Plumber", description: "Plumbing installation and repair work.", requiresVerification: true },
  { name: "Gardening", description: "Garden maintenance and landscaping.", requiresVerification: false },
  { name: "Moving & Removals", description: "Furniture moving, house removals.", requiresVerification: true },
  { name: "Delivery", description: "Parcel and item delivery/courier work.", requiresVerification: false },
  { name: "Grocery Pickup", description: "Shopping and grocery pickup/delivery.", requiresVerification: false },
  { name: "Makeup Artist", description: "Makeup application for events/occasions.", requiresVerification: false },
  { name: "Hairdressing", description: "Hair styling and barbering.", requiresVerification: false },
  { name: "Childcare", description: "Babysitting and childminding.", requiresVerification: true },
  { name: "Pet Sitting", description: "In-home pet care while the owner is away.", requiresVerification: true },
  { name: "IT Support", description: "Computer/device setup, repair, and troubleshooting.", requiresVerification: false },
  { name: "Handyman", description: "General home repairs and odd jobs.", requiresVerification: false },
  { name: "Painting & Decorating", description: "Interior and exterior painting/decorating.", requiresVerification: false },
  { name: "Furniture Assembly", description: "Flat-pack and furniture assembly.", requiresVerification: false },
];

// Admin-curated relationships for the feed's "related" slice. Listed as
// [categoryName, categoryName] pairs; order doesn't matter (see
// lib/categoryRelations.ts).
const STARTER_RELATIONS: [string, string][] = [
  ["Cleaning", "Gardening"],
  ["Cleaning", "Handyman"],
  ["Moving & Removals", "Delivery"],
  ["Moving & Removals", "Furniture Assembly"],
  ["Electrician", "Handyman"],
  ["Plumber", "Handyman"],
  ["Painting & Decorating", "Handyman"],
  ["Makeup Artist", "Hairdressing"],
  ["Childcare", "Pet Sitting"],
];

async function seedJobCategories() {
  const idByName = new Map<string, string>();

  for (const cat of STARTER_CATEGORIES) {
    const existing = await prisma.jobCategory.findUnique({ where: { name: cat.name } });
    if (existing) {
      idByName.set(cat.name, existing.id);
      continue;
    }
    const created = await prisma.jobCategory.create({ data: cat });
    idByName.set(cat.name, created.id);
    console.log(`Created job category: ${cat.name}`);
  }

  for (const [a, b] of STARTER_RELATIONS) {
    const idA = idByName.get(a);
    const idB = idByName.get(b);
    if (!idA || !idB) continue;
    const existing = await prisma.relatedJobCategory.findFirst({
      where: {
        OR: [
          { categoryAId: idA, categoryBId: idB },
          { categoryAId: idB, categoryBId: idA },
        ],
      },
    });
    if (existing) continue;
    await prisma.relatedJobCategory.create({ data: { categoryAId: idA, categoryBId: idB } });
    console.log(`Related categories: ${a} <-> ${b}`);
  }
}

async function main() {
  await seedCleaningProvider();
  await seedAdmin();
  await seedJobCategories();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
