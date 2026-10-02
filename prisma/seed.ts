/**
 * Seeds two independent things, both because they can't be created through
 * the normal sign-up API:
 *
 * 1. The one reserved CLEANING_PROVIDER account — the founder's own facility
 *    management / cleaning company.
 * 2. (Optional) the first SUPER_ADMIN account — there is no self-service way
 *    to become an admin, so someone has to be bootstrapped directly in the
 *    database. Once it exists, that super admin grants EDITOR/SUPPORT/
 *    DEVELOPER roles to other accounts via POST /api/admin/admins — see
 *    docs/ADMIN_API.md.
 *
 * Run with: npx prisma db seed
 *
 * Configure via env vars before running:
 *   CLEANING_PROVIDER_EMAIL      (required)
 *   CLEANING_PROVIDER_PASSWORD   (required — a real password, not a placeholder)
 *   CLEANING_PROVIDER_NAME       (default: "Anyrun Cleaning Services")
 *   CLEANING_PROVIDER_PHONE      (optional)
 *   ADMIN_EMAIL                  (optional — skips admin seeding if unset)
 *   ADMIN_PASSWORD               (required if ADMIN_EMAIL is set)
 *   ADMIN_NAME                   (default: "Platform Admin")
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// 1. Establish a native PostgreSQL connection pool using the Direct URL
const pool = new Pool({ 
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL 
});

// 2. Instantiate the Prisma adapter wrapper around the pool instance
const adapter = new PrismaPg(pool);

// 3. Inject the driver adapter directly into the client context options
const prisma = new PrismaClient({ adapter });

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

  // PostgreSQL supports the native 'has' filter for scalar/enum lists seamlessly
  const existingActive = await prisma.accountProfile.findMany({
    where: { 
      roles: { has: "CLEANING_PROVIDER" }, 
      isActive: true 
    },
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

  const user = await prisma.user.create({
    data: { email, phone, passwordHash, name: businessName },
  });

  const profile = await prisma.accountProfile.create({
    data: {
      userId: user.id,
      roles: ["CLEANING_PROVIDER"],
      accountKind: "BUSINESS",
      businessName,
      isActive: true,
      jobCategoryIds: [],
      // serviceRegions is a relational model, initialized as empty
      serviceRegions: {
        create: []
      },
    },
  });

  console.log(`Created CLEANING_PROVIDER account: user ${user.id}, profile ${profile.id}`);
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
      isActive: true,
      adminRole: "SUPER_ADMIN",
      jobCategoryIds: [],
      serviceRegions: {
        create: []
      },
    },
  });

  console.log(`Created super admin account: user ${user.id}, profile ${profile.id}`);
}

async function main() {
  await seedCleaningProvider();
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Gracefully close the Prisma Client context
    await prisma.$disconnect();
    // Gracefully shut down the native database connection pool
    await pool.end();
  });
