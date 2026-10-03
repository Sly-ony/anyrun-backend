import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Standard Next.js pattern: reuse a single PrismaClient (and its underlying
// connection pool) across hot reloads in dev, so we don't exhaust Supabase's
// connection limit on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pgPool?: Pool };

// Runtime queries go through DATABASE_URL — Supabase's pooled (pgbouncer,
// port 6543) connection string. Migrations/seeding use DIRECT_URL instead
// (see prisma.config.ts) since pgbouncer in transaction mode can't run DDL.
const pool =
  globalForPrisma.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

export default prisma;
