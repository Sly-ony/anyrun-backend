import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations need a direct (non-pgbouncer) connection — pgbouncer in
// transaction mode (Supabase's pooled port 6543) can't run DDL. Runtime
// queries use DATABASE_URL instead (see lib/prisma.ts); this file only
// governs `prisma migrate`/`prisma db seed`/`prisma studio`, so DIRECT_URL
// is the right default here even though the app itself never reads it
// outside this file and prisma/seed.ts.
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: dbUrl,
  },
});
